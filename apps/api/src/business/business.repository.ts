import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Input = Record<string, unknown>;

const performanceMetricLabels: Record<string, { label: string; unit: string }> = {
  TASK_RESPONSIBLE_APPROVED: { label: "负责人完成任务", unit: "单" },
  TASK_COLLABORATOR_APPROVED: { label: "协作完成任务", unit: "单" },
  SERVICE_DAY: { label: "实际服务天数", unit: "天" },
  SALE_CONFIRMED: { label: "确认销售单", unit: "单" },
  SALE_AMOUNT_100: { label: "确认销售金额", unit: "每100元" },
  FOOD_TRACE_VERIFIED: { label: "食品流转记录复核通过", unit: "批" },
  FOOD_TRACE_DAY: { label: "当日溯源记录完整", unit: "天" },
};

const performanceRecommendedTemplates = [
  {
    code: "SERVICE_WORKLOAD",
    name: "服务工作量型",
    description: "适合以审核通过的上门服务和实际服务天数为主要依据的门店。",
    recommendedDepartments: ["护理部", "服务部", "上门服务组"],
    values: {
      TASK_RESPONSIBLE_APPROVED: 10,
      TASK_COLLABORATOR_APPROVED: 4,
      SERVICE_DAY: 2,
      SALE_CONFIRMED: 0,
      SALE_AMOUNT_100: 0,
      FOOD_TRACE_VERIFIED: 0,
      FOOD_TRACE_DAY: 0,
    },
  },
  {
    code: "SERVICE_AND_SALES",
    name: "服务＋销售混合型",
    description: "在服务工作量之外，将已确认的养老产品销售纳入积分。",
    recommendedDepartments: ["护理部", "服务部", "上门服务组"],
    values: {
      TASK_RESPONSIBLE_APPROVED: 8,
      TASK_COLLABORATOR_APPROVED: 3,
      SERVICE_DAY: 1,
      SALE_CONFIRMED: 8,
      SALE_AMOUNT_100: 1,
      FOOD_TRACE_VERIFIED: 0,
      FOOD_TRACE_DAY: 0,
    },
  },
  {
    code: "FOOD_COMPLIANCE",
    name: "餐饮合规记录型",
    description: "按照复核通过的食品流转记录和完整记录天数计分，不使用主观口味评价。",
    recommendedDepartments: ["餐饮部"],
    values: {
      TASK_RESPONSIBLE_APPROVED: 0,
      TASK_COLLABORATOR_APPROVED: 0,
      SERVICE_DAY: 0,
      SALE_CONFIRMED: 0,
      SALE_AMOUNT_100: 0,
      FOOD_TRACE_VERIFIED: 2,
      FOOD_TRACE_DAY: 3,
    },
  },
];

const servicePerformanceRules = [
  { metricCode: "TASK_RESPONSIBLE_APPROVED", label: "负责人完成并通过审核", unit: "单", pointsPerUnit: 10 },
  { metricCode: "TASK_COLLABORATOR_APPROVED", label: "协作完成并通过审核", unit: "单", pointsPerUnit: 4 },
  { metricCode: "SERVICE_DAY", label: "实际参与服务", unit: "天", pointsPerUnit: 2 },
  { metricCode: "SALE_CONFIRMED", label: "经门店确认的产品服务", unit: "单", pointsPerUnit: 8 },
] as const;

const foodPerformanceRules = [
  { metricCode: "FOOD_TRACE_VERIFIED", label: "食品流转记录复核通过", unit: "批", pointsPerUnit: 2 },
  { metricCode: "FOOD_TRACE_DAY", label: "当日溯源记录完整", unit: "天", pointsPerUnit: 3 },
] as const;

export class BusinessRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath = process.env.LOCAL_SQLITE_PATH?.trim()) {
    const file = resolve(databasePath || ".local-data/care-dev.sqlite");
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureSchema();
    this.seed();
  }

  overview(tenantId: string) {
    const count = (table: string, clause = "") =>
      Number(
        (
          this.db
            .prepare(
              `SELECT COUNT(*) AS value FROM ${table} WHERE tenant_id = ? ${clause}`,
            )
            .get(tenantId) as { value: number }
        ).value,
      );
    return {
      staff: count("demo_staff_directory", "AND status = 'ACTIVE'"),
      contractsPending: count(
        "demo_contracts",
        "AND status IN ('DRAFT','PENDING_SIGN')",
      ),
      subsidyPending: count(
        "demo_subsidies",
        "AND status IN ('DRAFT','RETURNED')",
      ),
      promotionPending: count(
        "demo_promotion_assets",
        "AND review_status = 'PENDING'",
      ),
      foodToday: count("demo_food_traces", "AND service_date = '2026-08-09'"),
      legalHolds: count("demo_archives", "AND legal_hold = 1"),
    };
  }

  close() {
    this.db.close();
  }

  listDepartments(tenantId: string) {
    return this.rows("demo_departments", tenantId).map((row) => ({
      id: row.id,
      name: row.name,
      leader: row.leader,
      memberCount: Number(row.member_count),
      status: row.status,
    }));
  }

  createDepartment(tenantId: string, input: Input, actorId: string) {
    const name = required(input.name, "部门名称");
    const id = this.id("dept");
    this.db
      .prepare(
        "INSERT INTO demo_departments (id,tenant_id,name,leader,member_count,status,created_at) VALUES (?,?,?,?,0,'ACTIVE',?)",
      )
      .run(id, tenantId, name, text(input.leader, "待指定"), now());
    this.audit(actorId, tenantId, "DEPARTMENT_CREATE", "department", id, name);
    return this.listDepartments(tenantId).find((item) => item.id === id);
  }

  listStaff(tenantId: string) {
    return this.rows("demo_staff_directory", tenantId).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      role: row.role,
      departments: parse<string[]>(row.departments_json, []),
      status: row.status,
      qualification: row.qualification,
      joinedAt: row.joined_at,
    }));
  }

  getStaffProfile(tenantId: string, actorId: string) {
    const staff = this.listStaff(tenantId).find((item) => item.id === actorId);
    if (!staff || staff.status !== "ACTIVE") throw new Error("当前员工账号不可用");
    return {
      actorId: staff.id,
      tenantId,
      displayName: staff.name,
      role: staff.role,
      departments: staff.departments,
      isDemo: true,
    };
  }

  getStaffApplications(tenantId: string, actorId: string) {
    const staff = this.getStaffProfile(tenantId, actorId);
    const settings = this.getSettings(tenantId);
    const departments = staff.departments.map(String);
    const isFoodOnly = departments.length > 0 && departments.every((name) => name.includes("餐饮"));
    const attendsFixedShift = !isFoodOnly && departments.some((name) =>
      name.includes("护理") || name.includes("服务") || name.includes("行政"),
    );
    const foodTraceEnabled = Boolean(settings.foodTraceEnabled) && departments.some((name) => name.includes("餐饮"));
    return {
      attendance: {
        enabled: Boolean(settings.attendanceEnabled) && attendsFixedShift,
        label: "上下班考勤",
        policyName: isFoodOnly ? "餐饮岗位不启用固定班次" : "护理与上门组演示班次",
        mode: isFoodOnly ? "NONE" : "FIXED_SHIFT",
        description: isFoodOnly
          ? "餐饮岗位当前按食品流转职责留痕，不要求独立上下班打卡。"
          : "上下班考勤与每次服务的阶段记录分别统计。",
        sourceDepartments: departments,
      },
      foodTrace: {
        enabled: foodTraceEnabled,
        label: "食品追溯",
        description: "仅向承担餐饮职责的员工开放，用于拍摄票据、证件和批次标签。",
        sourceDepartments: departments.filter((name) => name.includes("餐饮")),
      },
      performance: {
        enabled: true,
        label: "我的工作与业绩",
        policyName: isFoodOnly ? "餐饮合规记录积分（演示）" : "照护服务贡献积分（演示）",
        description: isFoodOnly
          ? "按已复核的食品流转记录和完整记录天数计分，不评价菜品口味。"
          : "按实际任务中的负责人或协作角色计分，同一任务不会因跨部门任职重复计算。",
        sourceDepartments: departments,
      },
      customerFeedback: {
        enabled: Boolean(settings.customerFeedbackEnabled) && !isFoodOnly,
        label: "客户反馈",
      },
    };
  }

  getStaffWorkSummary(tenantId: string, actorId: string, month: string) {
    const normalizedMonth = normalizeMonth(month);
    const profile = this.getStaffProfile(tenantId, actorId);
    const applications = this.getStaffApplications(tenantId, actorId);
    const workload = this.listStaffPerformance(tenantId, normalizedMonth)
      .find((item) => item.staffId === actorId);
    if (!workload) throw new Error("未找到当前员工档案");
    const statement = this.listPerformanceStatements(tenantId, normalizedMonth)
      .find((item) => item.staffId === actorId);
    const isFoodOnly = profile.departments.length > 0 && profile.departments.every((name) => name.includes("餐饮"));
    const serviceValues: Record<string, number> = {
      TASK_RESPONSIBLE_APPROVED: workload.responsibleApproved,
      TASK_COLLABORATOR_APPROVED: workload.collaborativeApproved,
      SERVICE_DAY: workload.serviceDays,
      SALE_CONFIRMED: this.listSalesRecords(tenantId, normalizedMonth).filter(
        (item) => item.staffId === actorId && item.status === "CONFIRMED",
      ).length,
    };
    const foodRows = isFoodOnly
      ? (this.db.prepare(
          `SELECT status, service_date FROM demo_food_traces
            WHERE tenant_id=? AND created_by=? AND substr(service_date,1,7)=?`,
        ).all(tenantId, actorId, normalizedMonth) as Array<{ status: string; service_date: string }>)
      : [];
    const verifiedFoodRows = foodRows.filter((row) => row.status === "VERIFIED");
    const foodValues: Record<string, number> = {
      FOOD_TRACE_VERIFIED: verifiedFoodRows.length,
      FOOD_TRACE_DAY: new Set(verifiedFoodRows.map((row) => row.service_date)).size,
    };
    const publishedScheme = this.listPerformanceSchemes(tenantId).find((scheme) =>
      scheme.status === "PUBLISHED" &&
      scheme.effectiveFrom <= `${normalizedMonth}-31` &&
      scheme.scopeDepartments.some((department) => profile.departments.includes(department)),
    );
    const selectedRules = publishedScheme
      ? publishedScheme.rules.filter((rule) => rule.enabled)
      : isFoodOnly ? foodPerformanceRules : servicePerformanceRules;
    const values = isFoodOnly ? foodValues : serviceValues;
    const policyLines = selectedRules.map((rule) => {
      const metricCode = String(rule.metricCode);
      const quantity = values[metricCode] || 0;
      return {
        metricCode,
        label: String(rule.label),
        unit: String(rule.unit),
        pointsPerUnit: Number(rule.pointsPerUnit),
        quantity,
        points: quantity * Number(rule.pointsPerUnit),
      };
    });
    const policy = {
      name: publishedScheme?.name || applications.performance.policyName,
      version: publishedScheme?.version || 1,
      status: "DEMO_PUBLISHED",
      calculationNote: applications.performance.description,
      sourceDepartments: profile.departments,
      sourceDepartmentLabel: profile.departments.join("、"),
      lines: policyLines,
      totalPoints: policyLines.reduce((sum, line) => sum + line.points, 0),
    };
    return { month: normalizedMonth, workload, statement: statement || null, policy };
  }

  getAttendanceToday(tenantId: string, actorId: string) {
    const application = this.getStaffApplications(tenantId, actorId).attendance;
    const settings = this.getSettings(tenantId);
    if (!application.enabled) return { enabled: false, policy: application, record: null };
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const row = this.db.prepare(
      "SELECT * FROM demo_attendance_records WHERE tenant_id=? AND staff_id=? AND work_date=?",
    ).get(tenantId, actorId, date) as Record<string, unknown> | undefined;
    return {
      enabled: true,
      policy: {
        name: application.policyName,
        mode: application.mode,
        startTime: "09:00",
        endTime: "18:00",
        locationRadiusMeters: settings.locationRadiusMeters,
        description: application.description,
      },
      record: row ? {
        id: row.id, workDate: row.work_date, checkInAt: row.check_in_at,
        checkOutAt: row.check_out_at, locationStatus: row.location_status,
        exceptionStatus: row.exception_status, note: row.note, updatedAt: row.updated_at,
      } : null,
    };
  }

  checkAttendance(tenantId: string, actorId: string, input: Input) {
    const current = this.getAttendanceToday(tenantId, actorId);
    if (!current.enabled) throw new Error("本机构未启用上下班考勤");
    const action = String(input.action) === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const timestamp = now();
    const locationStatus = String(input.locationStatus) === "DENIED" ? "DENIED" : "SIMULATED";
    const existing = this.db.prepare(
      "SELECT * FROM demo_attendance_records WHERE tenant_id=? AND staff_id=? AND work_date=?",
    ).get(tenantId, actorId, date) as Record<string, unknown> | undefined;
    if (action === "CHECK_OUT" && !existing?.check_in_at) throw new Error("请先完成上班打卡");
    if (action === "CHECK_IN" && existing?.check_in_at) throw new Error("今天已经完成上班打卡");
    if (action === "CHECK_OUT" && existing?.check_out_at) throw new Error("今天已经完成下班打卡");
    if (!existing) {
      this.db.prepare(`INSERT INTO demo_attendance_records
        (id,tenant_id,staff_id,work_date,check_in_at,check_out_at,location_status,exception_status,note,updated_at)
        VALUES (?,?,?,?,?,NULL,?,'NORMAL',?,?)`).run(
        this.id("attendance"), tenantId, actorId, date, timestamp, locationStatus,
        text(input.note, ""), timestamp,
      );
    } else {
      this.db.prepare(`UPDATE demo_attendance_records SET check_out_at=?,location_status=?,note=?,updated_at=?
        WHERE tenant_id=? AND staff_id=? AND work_date=?`).run(
        timestamp, locationStatus, text(input.note, ""), timestamp, tenantId, actorId, date,
      );
    }
    this.audit(actorId, tenantId, action === "CHECK_IN" ? "ATTENDANCE_CHECK_IN" : "ATTENDANCE_CHECK_OUT", "attendance", date, locationStatus);
    return this.getAttendanceToday(tenantId, actorId);
  }

  uploadBusinessMedia(tenantId: string, actorId: string, input: Input) {
    const mediaType = ["IMAGE", "AUDIO", "SIGNATURE"].includes(String(input.mediaType))
      ? String(input.mediaType) : "IMAGE";
    const dataUrl = required(input.dataUrl, "测试文件");
    const sizeBytes = Number(input.sizeBytes) || Math.ceil(dataUrl.length * 0.75);
    const maxBytes = mediaType === "AUDIO" ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (sizeBytes <= 0 || sizeBytes > maxBytes || !dataUrl.startsWith("data:")) throw new Error("文件无效或超过大小限制");
    const id = this.id("media");
    this.db.prepare(`INSERT INTO demo_business_media
      (id,tenant_id,business_type,business_id,media_type,file_name,mime_type,size_bytes,duration_seconds,data_url,uploaded_by,is_test,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, tenantId, text(input.businessType, "UNBOUND"), text(input.businessId, "DRAFT"), mediaType,
      text(input.fileName, `${mediaType.toLowerCase()}-${Date.now()}`), text(input.mimeType, "application/octet-stream"),
      sizeBytes, Math.max(0, Math.min(180, Number(input.durationSeconds) || 0)), dataUrl, actorId, 1, now(),
    );
    this.audit(actorId, tenantId, "MEDIA_UPLOAD", "business_media", id, mediaType);
    return this.getBusinessMedia(tenantId, id);
  }

  getBusinessMedia(tenantId: string, id: string) {
    const row = this.db.prepare("SELECT * FROM demo_business_media WHERE tenant_id=? AND id=?")
      .get(tenantId, id) as Record<string, unknown> | undefined;
    return row ? { id: row.id, businessType: row.business_type, businessId: row.business_id,
      mediaType: row.media_type, fileName: row.file_name, mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes), durationSeconds: Number(row.duration_seconds),
      dataUrl: row.data_url, uploadedBy: row.uploaded_by, createdAt: row.created_at, isTest: true } : null;
  }

  listStaffPerformance(tenantId: string, month: string) {
    const normalizedMonth = /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);
    const taskTable = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='demo_staff_tasks'",
      )
      .get();
    const tasks = taskTable
      ? (this.db
          .prepare(
            `SELECT id, scheduled_at, responsible_id, participant_ids_json, status
               FROM demo_staff_tasks
              WHERE tenant_id = ? AND substr(scheduled_at, 1, 7) = ?
              ORDER BY scheduled_at`,
          )
          .all(tenantId, normalizedMonth) as Array<Record<string, unknown>>)
      : [];
    const returnedTaskIds = new Set<string>();
    const historyTable = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='demo_task_history'",
      )
      .get();
    if (historyTable) {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT task_id FROM demo_task_history
            WHERE tenant_id = ? AND status = 'RETURNED'`,
        )
        .all(tenantId) as Array<{ task_id: string }>;
      for (const row of rows) returnedTaskIds.add(row.task_id);
    }
    return this.listStaff(tenantId).map((staff) => {
      const staffTasks = tasks.filter((task) => {
        const participants = parse<string[]>(task.participant_ids_json, []);
        return task.responsible_id === staff.id || participants.includes(String(staff.id));
      });
      const responsibleTasks = staffTasks.filter(
        (task) => task.responsible_id === staff.id,
      );
      const collaborativeTasks = staffTasks.filter(
        (task) => task.responsible_id !== staff.id,
      );
      const approvedTasks = staffTasks.filter((task) => task.status === "APPROVED");
      const dailyMap = new Map<
        string,
        { date: string; assigned: number; approved: number; responsible: number; collaborative: number }
      >();
      for (const task of staffTasks) {
        const date = String(task.scheduled_at).slice(0, 10);
        const value = dailyMap.get(date) || {
          date,
          assigned: 0,
          approved: 0,
          responsible: 0,
          collaborative: 0,
        };
        value.assigned += 1;
        if (task.status === "APPROVED") value.approved += 1;
        if (task.responsible_id === staff.id) value.responsible += 1;
        else value.collaborative += 1;
        dailyMap.set(date, value);
      }
      return {
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
        departments: staff.departments,
        status: staff.status,
        month: normalizedMonth,
        assignedTasks: staffTasks.length,
        approvedTasks: approvedTasks.length,
        responsibleTasks: responsibleTasks.length,
        collaborativeTasks: collaborativeTasks.length,
        responsibleApproved: responsibleTasks.filter(
          (task) => task.status === "APPROVED",
        ).length,
        collaborativeApproved: collaborativeTasks.filter(
          (task) => task.status === "APPROVED",
        ).length,
        returnedTasks: staffTasks.filter((task) =>
          returnedTaskIds.has(String(task.id)),
        ).length,
        serviceDays: dailyMap.size,
        pendingTasks: staffTasks.filter((task) => task.status !== "APPROVED").length,
        daily: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  }

  createStaff(tenantId: string, input: Input, actorId: string) {
    const name = required(input.name, "员工姓名");
    const id = this.id("staff");
    const departments = Array.isArray(input.departments)
      ? input.departments.map(String).filter(Boolean)
      : [];
    if (!departments.length) throw new Error("至少选择一个部门");
    this.db
      .prepare(
        `INSERT INTO demo_staff_directory
      (id,tenant_id,name,phone,role,departments_json,status,qualification,joined_at,created_at)
      VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?)`,
      )
      .run(
        id,
        tenantId,
        name,
        text(input.phone, "未登记"),
        text(input.role, "服务人员"),
        JSON.stringify(departments),
        text(input.qualification, "普通服务"),
        text(input.joinedAt, "2026-08-09"),
        now(),
      );
    this.audit(actorId, tenantId, "STAFF_CREATE", "staff", id, name);
    return this.listStaff(tenantId).find((item) => item.id === id);
  }

  listPerformanceSchemes(tenantId: string) {
    const schemes = this.db
      .prepare(
        `SELECT * FROM demo_performance_schemes
          WHERE tenant_id=? ORDER BY version_no DESC`,
      )
      .all(tenantId) as Array<Record<string, unknown>>;
    const ruleStatement = this.db.prepare(
      `SELECT * FROM demo_performance_rules
        WHERE tenant_id=? AND scheme_id=? ORDER BY sort_order`,
    );
    return schemes.map((scheme) => ({
      id: String(scheme.id),
      name: String(scheme.name),
      version: Number(scheme.version_no),
      status: String(scheme.status),
      effectiveFrom: String(scheme.effective_from),
      createdAt: String(scheme.created_at),
      scopeDepartments: parse<string[]>(scheme.scope_departments_json, []),
      rules: (ruleStatement.all(tenantId, String(scheme.id)) as Array<Record<string, unknown>>).map(
        (rule) => ({
          id: rule.id,
          metricCode: rule.metric_code,
          label: rule.label,
          pointsPerUnit: Number(rule.points_per_unit),
          unit: rule.unit_label,
          enabled: Boolean(rule.enabled),
        }),
      ),
    }));
  }

  listPerformanceTemplates() {
    return {
      metrics: Object.entries(performanceMetricLabels).map(
        ([metricCode, definition]) => ({ metricCode, ...definition }),
      ),
      templates: performanceRecommendedTemplates.map((template) => ({
        ...template,
        rules: Object.entries(performanceMetricLabels).map(
          ([metricCode, definition]) => ({
            metricCode,
            ...definition,
            pointsPerUnit:
              template.values[
                metricCode as keyof typeof template.values
              ] || 0,
          }),
        ),
      })),
    };
  }

  publishPerformanceScheme(tenantId: string, input: Input, actorId: string) {
    const versionRow = this.db
      .prepare(
        "SELECT COALESCE(MAX(version_no),0)+1 AS value FROM demo_performance_schemes WHERE tenant_id=?",
      )
      .get(tenantId) as { value: number };
    const schemeId = this.id("points-scheme");
    const version = Number(versionRow.value);
    const effectiveFrom = required(input.effectiveFrom, "生效日期");
    const scopeDepartments = Array.isArray(input.scopeDepartments)
      ? [...new Set((input.scopeDepartments as unknown[]).map(String).filter(Boolean))]
      : [];
    if (!scopeDepartments.length) throw new Error("至少选择一个适用部门");
    const submittedRules = Array.isArray(input.rules)
      ? (input.rules as Array<Record<string, unknown>>)
      : [];
    const rules = Object.entries(performanceMetricLabels).map(
      ([metricCode, definition]) => {
        const submitted = submittedRules.find(
          (item) => String(item.metricCode) === metricCode,
        );
        const points = Number(submitted?.pointsPerUnit ?? 0);
        if (!Number.isFinite(points) || points < 0 || points > 10000)
          throw new Error(`${definition.label}积分必须在0至10000之间`);
        return {
          metricCode,
          ...definition,
          points,
          enabled: submitted?.enabled !== false && points > 0,
        };
      },
    );
    if (!rules.some((rule) => rule.enabled))
      throw new Error("积分方案至少启用一条计分规则");
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO demo_performance_schemes
           (id,tenant_id,name,version_no,status,effective_from,created_at,scope_departments_json)
           VALUES (?,?,?,?,'PUBLISHED',?,?,?)`,
        )
        .run(
          schemeId,
          tenantId,
          required(input.name, "方案名称"),
          version,
          effectiveFrom,
          now(),
          JSON.stringify(scopeDepartments),
        );
      const insertRule = this.db.prepare(
        `INSERT INTO demo_performance_rules
         (id,tenant_id,scheme_id,metric_code,label,points_per_unit,unit_label,enabled,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      rules.forEach((rule, index) =>
        insertRule.run(
          this.id("points-rule"),
          tenantId,
          schemeId,
          rule.metricCode,
          rule.label,
          rule.points,
          rule.unit,
          rule.enabled ? 1 : 0,
          index,
        ),
      );
      this.audit(
        actorId,
        tenantId,
        "PERFORMANCE_SCHEME_PUBLISH",
        "performance_scheme",
        schemeId,
        `第${version}版，${effectiveFrom}生效`,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listPerformanceSchemes(tenantId).find(
      (item) => item.id === schemeId,
    );
  }

  listSalesRecords(tenantId: string, month: string) {
    const normalizedMonth = normalizeMonth(month);
    return (
      this.db
        .prepare(
          `SELECT s.*, d.name AS staff_name
             FROM demo_sales_records s
             LEFT JOIN demo_staff_directory d
               ON d.tenant_id=s.tenant_id AND d.id=s.staff_id
            WHERE s.tenant_id=? AND substr(s.sold_at,1,7)=?
            ORDER BY s.sold_at DESC, s.created_at DESC`,
        )
        .all(tenantId, normalizedMonth) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      staffName: row.staff_name || "员工已离职",
      itemName: row.item_name,
      quantity: Number(row.quantity),
      amountCents: Number(row.amount_cents),
      soldAt: row.sold_at,
      status: row.status,
      confirmedAt: row.confirmed_at,
    }));
  }

  createSalesRecord(tenantId: string, input: Input, actorId: string) {
    const staffId = required(input.staffId, "销售员工");
    const staff = this.listStaff(tenantId).find((item) => item.id === staffId);
    if (!staff) throw new Error("未找到销售员工");
    const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
    const amountCents = Math.max(0, Math.round(Number(input.amountCents) || 0));
    if (!amountCents) throw new Error("销售金额必须大于0");
    const id = this.id("sale");
    this.db
      .prepare(
        `INSERT INTO demo_sales_records
         (id,tenant_id,staff_id,item_name,quantity,amount_cents,sold_at,status,confirmed_at,created_at)
         VALUES (?,?,?,?,?,?,?,'PENDING',NULL,?)`,
      )
      .run(
        id,
        tenantId,
        staffId,
        required(input.itemName, "销售项目"),
        quantity,
        amountCents,
        required(input.soldAt, "销售日期"),
        now(),
      );
    this.audit(actorId, tenantId, "SALE_CREATE", "sales_record", id, String(staff.name));
    return this.listSalesRecords(tenantId, String(input.soldAt).slice(0, 7)).find(
      (item) => item.id === id,
    );
  }

  salesRecordAction(
    tenantId: string,
    id: string,
    action: string,
    actorId: string,
  ) {
    const status = action === "CONFIRM" ? "CONFIRMED" : action === "CANCEL" ? "CANCELED" : "";
    if (!status) throw new Error("不支持的销售记录操作");
    const result = this.db
      .prepare(
        `UPDATE demo_sales_records SET status=?,confirmed_at=?
          WHERE tenant_id=? AND id=? AND status='PENDING'`,
      )
      .run(status, status === "CONFIRMED" ? now() : null, tenantId, id);
    if (!result.changes) throw new Error("销售记录不存在或已经处理");
    this.audit(actorId, tenantId, `SALE_${action}`, "sales_record", id, null);
    return { id, status };
  }

  listPerformanceStatements(tenantId: string, month: string) {
    const normalizedMonth = normalizeMonth(month);
    return (
      this.db
        .prepare(
          `SELECT p.*, d.name AS staff_name, d.role AS staff_role
             FROM demo_performance_statements p
             LEFT JOIN demo_staff_directory d
               ON d.tenant_id=p.tenant_id AND d.id=p.staff_id
            WHERE p.tenant_id=? AND p.year_month=?
            ORDER BY d.name`,
        )
        .all(tenantId, normalizedMonth) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      staffName: row.staff_name || "员工已离职",
      staffRole: row.staff_role || "历史任职",
      month: row.year_month,
      schemeId: row.scheme_id,
      schemeVersion: Number(row.scheme_version),
      schemeName: row.scheme_name,
      status: row.status,
      lines: parse<Array<Record<string, unknown>>>(row.lines_json, []),
      adjustments: parse<Array<Record<string, unknown>>>(row.adjustments_json, []),
      basePoints: Number(row.base_points),
      adjustmentPoints: Number(row.adjustment_points),
      totalPoints: Number(row.total_points),
      calculatedAt: row.calculated_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  calculatePerformanceStatements(tenantId: string, month: string, actorId: string) {
    const normalizedMonth = normalizeMonth(month);
    const monthEnd = `${normalizedMonth}-31`;
    const publishedSchemes = this.listPerformanceSchemes(tenantId).filter(
      (scheme) => scheme.status === "PUBLISHED" && scheme.effectiveFrom <= monthEnd,
    );
    if (!publishedSchemes.length) throw new Error("当前月份没有已生效的积分方案");
    const workload = this.listStaffPerformance(tenantId, normalizedMonth);
    const sales = this.listSalesRecords(tenantId, normalizedMonth).filter(
      (item) => item.status === "CONFIRMED",
    );
    const statement = this.db.prepare(
      `INSERT INTO demo_performance_statements
       (id,tenant_id,staff_id,year_month,scheme_id,scheme_version,scheme_name,status,
        scheme_snapshot_json,lines_json,adjustments_json,base_points,adjustment_points,total_points,
        calculated_at,confirmed_at)
       VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,'[]',?,0,?, ?,NULL)
       ON CONFLICT(tenant_id,staff_id,year_month) DO UPDATE SET
         scheme_id=excluded.scheme_id,scheme_version=excluded.scheme_version,
         scheme_name=excluded.scheme_name,scheme_snapshot_json=excluded.scheme_snapshot_json,
         lines_json=excluded.lines_json,base_points=excluded.base_points,
         total_points=excluded.base_points+demo_performance_statements.adjustment_points,
         calculated_at=excluded.calculated_at
       WHERE demo_performance_statements.status='DRAFT'`,
    );
    this.db.exec("BEGIN");
    try {
      for (const staff of workload) {
        const schemeDetail = publishedSchemes.find((scheme) =>
          scheme.scopeDepartments.some((department) => staff.departments.includes(department)),
        );
        if (!schemeDetail) continue;
        const rules = schemeDetail.rules.filter((rule) => rule.enabled);
        const staffSales = sales.filter((sale) => sale.staffId === staff.staffId);
        const salesAmount = staffSales.reduce(
          (sum, sale) => sum + Number(sale.amountCents),
          0,
        );
        const metricValues: Record<string, number> = {
          TASK_RESPONSIBLE_APPROVED: staff.responsibleApproved,
          TASK_COLLABORATOR_APPROVED: staff.collaborativeApproved,
          SERVICE_DAY: staff.serviceDays,
          SALE_CONFIRMED: staffSales.length,
          SALE_AMOUNT_100: Math.floor(salesAmount / 10000),
        };
        const foodRows = this.db.prepare(
          `SELECT status,service_date FROM demo_food_traces
            WHERE tenant_id=? AND created_by=? AND substr(service_date,1,7)=?`,
        ).all(tenantId, String(staff.staffId), normalizedMonth) as Array<{ status: string; service_date: string }>;
        const verifiedFoodRows = foodRows.filter((row) => row.status === "VERIFIED");
        metricValues.FOOD_TRACE_VERIFIED = verifiedFoodRows.length;
        metricValues.FOOD_TRACE_DAY = new Set(verifiedFoodRows.map((row) => row.service_date)).size;
        const lines = rules.map((rule) => {
          const units = metricValues[String(rule.metricCode)] || 0;
          return {
            metricCode: rule.metricCode,
            label: rule.label,
            units,
            unit: rule.unit,
            pointsPerUnit: rule.pointsPerUnit,
            points: units * rule.pointsPerUnit,
          };
        });
        const basePoints = lines.reduce((sum, line) => sum + line.points, 0);
        statement.run(
          this.id("points-statement"),
          tenantId,
          String(staff.staffId),
          normalizedMonth,
          schemeDetail.id,
          schemeDetail.version,
          schemeDetail.name,
          JSON.stringify(schemeDetail),
          JSON.stringify(lines),
          basePoints,
          basePoints,
          now(),
        );
      }
      this.audit(
        actorId,
        tenantId,
        "PERFORMANCE_CALCULATE",
        "performance_statement",
        normalizedMonth,
        `按员工所属部门匹配${publishedSchemes.length}套已生效方案`,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listPerformanceStatements(tenantId, normalizedMonth);
  }

  adjustPerformanceStatement(
    tenantId: string,
    id: string,
    input: Input,
    actorId: string,
  ) {
    const row = this.db
      .prepare(
        "SELECT * FROM demo_performance_statements WHERE tenant_id=? AND id=?",
      )
      .get(tenantId, id) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (row.status !== "DRAFT") throw new Error("已确认的绩效单不能调整");
    const points = Number(input.points);
    if (!Number.isFinite(points) || points === 0 || Math.abs(points) > 10000)
      throw new Error("调整积分必须是-10000至10000之间的非零数字");
    const reason = required(input.reason, "调整原因");
    const adjustments = parse<Array<Record<string, unknown>>>(
      row.adjustments_json,
      [],
    );
    adjustments.push({ id: this.id("adjustment"), points, reason, actorId, createdAt: now() });
    const adjustmentPoints = adjustments.reduce(
      (sum, item) => sum + Number(item.points),
      0,
    );
    this.db
      .prepare(
        `UPDATE demo_performance_statements
            SET adjustments_json=?,adjustment_points=?,total_points=base_points+?
          WHERE tenant_id=? AND id=?`,
      )
      .run(JSON.stringify(adjustments), adjustmentPoints, adjustmentPoints, tenantId, id);
    this.audit(actorId, tenantId, "PERFORMANCE_ADJUST", "performance_statement", id, reason);
    return this.listPerformanceStatements(tenantId, String(row.year_month)).find(
      (item) => item.id === id,
    );
  }

  confirmPerformanceStatement(tenantId: string, id: string, actorId: string) {
    const result = this.db
      .prepare(
        `UPDATE demo_performance_statements SET status='CONFIRMED',confirmed_at=?
          WHERE tenant_id=? AND id=? AND status='DRAFT'`,
      )
      .run(now(), tenantId, id);
    if (!result.changes) throw new Error("绩效单不存在或已经确认");
    this.audit(actorId, tenantId, "PERFORMANCE_CONFIRM", "performance_statement", id, null);
    return { id, status: "CONFIRMED" };
  }

  listContracts(tenantId: string) {
    return this.rows("demo_contracts", tenantId).map((row) => ({
      id: row.id,
      contractNo: row.contract_no,
      elderName: row.elder_name,
      type: row.type,
      status: row.status,
      version: Number(row.version_no),
      fileName: row.file_name,
      signedAt: row.signed_at,
      validUntil: row.valid_until,
      updatedAt: row.updated_at,
    }));
  }

  createContract(tenantId: string, input: Input, actorId: string) {
    const elderName = required(input.elderName, "服务对象");
    const id = this.id("contract");
    const contractNo = `HT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    this.db
      .prepare(
        `INSERT INTO demo_contracts
      (id,tenant_id,contract_no,elder_name,type,status,version_no,file_name,signed_at,valid_until,updated_at)
      VALUES (?,?,?,?,?,'DRAFT',1,?,NULL,?,?)`,
      )
      .run(
        id,
        tenantId,
        contractNo,
        elderName,
        text(input.type, "居家养老上门服务合同"),
        text(input.fileName, "待上传"),
        text(input.validUntil, "2027-08-31"),
        now(),
      );
    this.audit(
      actorId,
      tenantId,
      "CONTRACT_CREATE",
      "contract",
      id,
      contractNo,
    );
    return this.listContracts(tenantId).find((item) => item.id === id);
  }

  contractAction(
    tenantId: string,
    id: string,
    action: string,
    actorId: string,
  ) {
    const status =
      action === "REQUEST_SIGN"
        ? "PENDING_SIGN"
        : action === "SIGN"
          ? "SIGNED"
          : action === "ARCHIVE"
            ? "ARCHIVED"
            : "";
    if (!status) throw new Error("不支持的合同操作");
    const current = this.db
      .prepare("SELECT status FROM demo_contracts WHERE tenant_id=? AND id=?")
      .get(tenantId, id) as { status: string } | undefined;
    if (!current) return null;
    if (status === "ARCHIVED" && current.status !== "SIGNED")
      throw new Error("合同签署后才能归档");
    this.db
      .prepare(
        "UPDATE demo_contracts SET status=?, signed_at=CASE WHEN ?='SIGNED' THEN ? ELSE signed_at END, updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(status, status, now(), now(), tenantId, id);
    this.audit(
      actorId,
      tenantId,
      `CONTRACT_${action}`,
      "contract",
      id,
      "演示件，不具业务效力",
    );
    return this.listContracts(tenantId).find((item) => item.id === id);
  }

  listSubsidies(tenantId: string) {
    return this.rows("demo_subsidies", tenantId).map((row) => ({
      id: row.id,
      elderName: row.elder_name,
      yearMonth: row.year_month,
      recordCount: Number(row.record_count),
      totalCents: Number(row.total_cents),
      voucherCents: Number(row.voucher_cents),
      status: row.status,
      returnReason: row.return_reason,
      submittedAt: row.submitted_at,
      packageName: row.package_name,
    }));
  }

  createSubsidy(tenantId: string, input: Input, actorId: string) {
    const elderName = required(input.elderName, "服务对象");
    const id = this.id("subsidy");
    const month = text(input.yearMonth, "2026-08");
    this.db
      .prepare(
        `INSERT INTO demo_subsidies
      (id,tenant_id,elder_name,year_month,record_count,total_cents,voucher_cents,status,return_reason,submitted_at,package_name,updated_at)
      VALUES (?,?,?,?,?,?,?,'DRAFT',NULL,NULL,?,?)`,
      )
      .run(
        id,
        tenantId,
        elderName,
        month,
        Math.max(1, Number(input.recordCount) || 4),
        Math.max(0, Number(input.totalCents) || 60000),
        Math.max(0, Number(input.voucherCents) || 60000),
        `${elderName}-${month}-核销材料包.zip`,
        now(),
      );
    this.audit(actorId, tenantId, "SUBSIDY_CREATE", "subsidy", id, month);
    return this.listSubsidies(tenantId).find((item) => item.id === id);
  }

  subsidyAction(
    tenantId: string,
    id: string,
    action: string,
    reason: string,
    actorId: string,
  ) {
    const map: Record<string, string> = {
      GENERATE: "READY",
      SUBMIT: "SUBMITTED",
      ACCEPT: "ACCEPTED",
      RETURN: "RETURNED",
    };
    const status = map[action];
    if (!status) throw new Error("不支持的核销操作");
    if (action === "RETURN" && !reason.trim())
      throw new Error("退回时必须填写原因");
    const result = this.db
      .prepare(
        "UPDATE demo_subsidies SET status=?,return_reason=?,submitted_at=CASE WHEN ?='SUBMITTED' THEN ? ELSE submitted_at END,updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(
        status,
        action === "RETURN" ? reason.trim() : null,
        status,
        now(),
        now(),
        tenantId,
        id,
      );
    if (!result.changes) return null;
    this.audit(
      actorId,
      tenantId,
      `SUBSIDY_${action}`,
      "subsidy",
      id,
      reason || "材料状态已更新",
    );
    return this.listSubsidies(tenantId).find((item) => item.id === id);
  }

  listPromotion(tenantId: string) {
    return this.rows("demo_promotion_assets", tenantId).map((row) => ({
      id: row.id,
      title: row.title,
      elderName: row.elder_name,
      consentStatus: row.consent_status,
      reviewStatus: row.review_status,
      fileName: row.file_name,
      sourceStage: row.source_stage,
      downloadable: Boolean(row.downloadable),
      updatedAt: row.updated_at,
    }));
  }

  createPromotion(tenantId: string, input: Input, actorId: string) {
    const title = required(input.title, "素材标题");
    const id = this.id("asset");
    this.db
      .prepare(
        `INSERT INTO demo_promotion_assets
      (id,tenant_id,title,elder_name,consent_status,review_status,file_name,source_stage,downloadable,updated_at)
      VALUES (?,?,?,?,'VALID','PENDING',?,?,0,?)`,
      )
      .run(
        id,
        tenantId,
        title,
        text(input.elderName, "未关联服务对象"),
        text(input.fileName, "现场服务照片.jpg"),
        text(input.sourceStage, "服务后"),
        now(),
      );
    this.audit(
      actorId,
      tenantId,
      "PROMOTION_SELECT",
      "promotion_asset",
      id,
      title,
    );
    return this.listPromotion(tenantId).find((item) => item.id === id);
  }

  promotionAction(
    tenantId: string,
    id: string,
    action: string,
    actorId: string,
  ) {
    const status =
      action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "";
    if (!status) throw new Error("不支持的素材审核操作");
    const result = this.db
      .prepare(
        "UPDATE demo_promotion_assets SET review_status=?,downloadable=?,updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(status, status === "APPROVED" ? 1 : 0, now(), tenantId, id);
    if (!result.changes) return null;
    this.audit(
      actorId,
      tenantId,
      `PROMOTION_${action}`,
      "promotion_asset",
      id,
      null,
    );
    return this.listPromotion(tenantId).find((item) => item.id === id);
  }

  listFood(tenantId: string) {
    return this.rows("demo_food_traces", tenantId).map((row) => {
      const evidenceIds = parse<string[]>(row.evidence_ids_json, []);
      return {
        id: row.id,
        serviceDate: row.service_date,
        ingredient: row.ingredient,
        supplier: row.supplier,
        batchNo: row.batch_no,
        certificate: row.certificate,
        responsible: row.responsible,
        status: row.status,
        flowType: row.flow_type || "PURCHASE_IN",
        quantity: row.quantity || "",
        evidenceIds,
        evidence: evidenceIds.map((id) => this.getBusinessMedia(tenantId, id)).filter(Boolean),
        voiceMediaId: row.voice_media_id || "",
        voice: row.voice_media_id ? this.getBusinessMedia(tenantId, String(row.voice_media_id)) : null,
        createdBy: row.created_by || "",
        reviewedBy: row.reviewed_by || "",
        reviewedAt: row.reviewed_at || "",
        returnReason: row.return_reason || "",
        updatedAt: row.updated_at || row.created_at,
      };
    });
  }

  createFood(tenantId: string, input: Input, actorId: string) {
    const ingredient = required(input.ingredient, "食材名称");
    const id = this.id("food");
    this.db
      .prepare(
        `INSERT INTO demo_food_traces
      (id,tenant_id,service_date,ingredient,supplier,batch_no,certificate,responsible,status,created_at,
       flow_type,quantity,evidence_ids_json,voice_media_id,created_by,reviewed_by,reviewed_at,return_reason,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        tenantId,
        text(input.serviceDate, "2026-08-09"),
        ingredient,
        text(input.supplier, "兰州安心农产品配送中心"),
        text(input.batchNo, `PC-${Date.now()}`),
        text(input.certificate, "进货票据已登记"),
        text(input.responsible, "陈师傅"),
        text(input.status, "SUBMITTED"),
        now(),
        text(input.flowType, "PURCHASE_IN"),
        text(input.quantity, ""),
        JSON.stringify(Array.isArray(input.evidenceIds) ? input.evidenceIds.map(String).slice(0, 12) : []),
        text(input.voiceMediaId, ""),
        actorId,
        "",
        "",
        "",
        now(),
      );
    this.audit(
      actorId,
      tenantId,
      "FOOD_TRACE_CREATE",
      "food_trace",
      id,
      ingredient,
    );
    return this.listFood(tenantId).find((item) => item.id === id);
  }

  foodAction(tenantId: string, id: string, action: string, reason: string, actorId: string) {
    const status = action === "VERIFY" ? "VERIFIED" : action === "RETURN" ? "RETURNED" : "";
    if (!status) throw new Error("不支持的食品追溯复核操作");
    if (status === "RETURNED" && !reason.trim()) throw new Error("退回时必须填写原因");
    const result = this.db.prepare(`UPDATE demo_food_traces SET status=?,reviewed_by=?,reviewed_at=?,return_reason=?,updated_at=?
      WHERE tenant_id=? AND id=? AND status IN ('SUBMITTED','RETURNED')`).run(
      status, actorId, now(), status === "RETURNED" ? reason.trim().slice(0, 500) : "", now(), tenantId, id,
    );
    if (!result.changes) throw new Error("记录不存在或当前状态不能复核");
    this.audit(actorId, tenantId, `FOOD_TRACE_${action}`, "food_trace", id, reason || null);
    return this.listFood(tenantId).find((item) => item.id === id);
  }

  listEngagements(tenantId: string) {
    return this.rows("demo_engagements", tenantId).map((row) => ({
      id: row.id,
      elderName: row.elder_name,
      mode: row.mode,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      responsible: row.responsible,
      frequency: row.frequency,
    }));
  }

  createEngagement(tenantId: string, input: Input, actorId: string) {
    const elderName = required(input.elderName, "服务对象");
    const id = this.id("engagement");
    this.db
      .prepare(
        `INSERT INTO demo_engagements
      (id,tenant_id,elder_name,mode,start_date,end_date,status,responsible,frequency,created_at)
      VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?)`,
      )
      .run(
        id,
        tenantId,
        elderName,
        text(input.mode, "PERIODIC_HOME_VISIT"),
        text(input.startDate, "2026-08-09"),
        text(input.endDate, "长期"),
        text(input.responsible, "刘阿姨"),
        text(input.frequency, "每周一次"),
        now(),
      );
    this.audit(
      actorId,
      tenantId,
      "ENGAGEMENT_CREATE",
      "engagement",
      id,
      elderName,
    );
    return this.listEngagements(tenantId).find((item) => item.id === id);
  }

  listArchives(tenantId: string) {
    return this.rows("demo_archives", tenantId).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      retentionUntil: row.retention_until,
      legalHold: Boolean(row.legal_hold),
      exportStatus: row.export_status,
      updatedAt: row.updated_at,
    }));
  }

  archiveAction(tenantId: string, id: string, action: string, actorId: string) {
    if (!["HOLD", "RELEASE", "EXPORT"].includes(action))
      throw new Error("不支持的归档操作");
    const hold = action === "HOLD" ? 1 : action === "RELEASE" ? 0 : undefined;
    const result =
      hold === undefined
        ? this.db
            .prepare(
              "UPDATE demo_archives SET export_status='READY',updated_at=? WHERE tenant_id=? AND id=?",
            )
            .run(now(), tenantId, id)
        : this.db
            .prepare(
              "UPDATE demo_archives SET legal_hold=?,updated_at=? WHERE tenant_id=? AND id=?",
            )
            .run(hold, now(), tenantId, id);
    if (!result.changes) return null;
    this.audit(actorId, tenantId, `ARCHIVE_${action}`, "archive", id, null);
    return this.listArchives(tenantId).find((item) => item.id === id);
  }

  getSettings(tenantId: string) {
    const row = this.db
      .prepare("SELECT * FROM demo_org_settings WHERE tenant_id=?")
      .get(tenantId) as Record<string, unknown>;
    return {
      organizationName: row.organization_name,
      locationRadiusMeters: Number(row.location_radius_meters),
      timeToleranceMinutes: Number(row.time_tolerance_minutes),
      evidenceRetentionYears: Number(row.evidence_retention_years),
      contractRetention: row.contract_retention,
      attendanceEnabled: Boolean(row.attendance_enabled),
      foodTraceEnabled: Boolean(row.food_trace_enabled),
      customerFeedbackEnabled: Boolean(row.customer_feedback_enabled),
      updatedAt: row.updated_at,
    };
  }

  saveSettings(tenantId: string, input: Input, actorId: string) {
    this.db
      .prepare(
        `UPDATE demo_org_settings SET organization_name=?,location_radius_meters=?,time_tolerance_minutes=?,evidence_retention_years=?,
         attendance_enabled=?,food_trace_enabled=?,customer_feedback_enabled=?,updated_at=? WHERE tenant_id=?`,
      )
      .run(
        required(input.organizationName, "机构名称"),
        Math.max(50, Number(input.locationRadiusMeters) || 300),
        Math.max(0, Number(input.timeToleranceMinutes) || 30),
        Math.min(5, Math.max(1, Number(input.evidenceRetentionYears) || 3)),
        input.attendanceEnabled === false ? 0 : 1,
        input.foodTraceEnabled === false ? 0 : 1,
        input.customerFeedbackEnabled === false ? 0 : 1,
        now(),
        tenantId,
      );
    this.audit(
      actorId,
      tenantId,
      "ORG_SETTINGS_UPDATE",
      "organization",
      tenantId,
      null,
    );
    return this.getSettings(tenantId);
  }

  private rows(table: string, tenantId: string) {
    return this.db
      .prepare(`SELECT * FROM ${table} WHERE tenant_id=? ORDER BY rowid DESC`)
      .all(tenantId) as Array<Record<string, unknown>>;
  }

  private id(prefix: string) {
    return `${prefix}-${randomUUID().slice(0, 10)}`;
  }

  private audit(
    actorId: string,
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    reason: string | null,
  ) {
    this.db
      .prepare(
        `INSERT INTO demo_audit_events
      (id,tenant_id,actor_id,action,resource_type,resource_id,outcome,reason,occurred_at)
      VALUES (?,?,?,?,?,?,'SUCCESS',?,?)`,
      )
      .run(
        this.id("audit"),
        tenantId,
        actorId,
        action,
        resourceType,
        resourceId,
        reason,
        now(),
      );
  }

  private ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS demo_audit_events (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT NOT NULL,resource_id TEXT NOT NULL,outcome TEXT NOT NULL,reason TEXT,occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_departments (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,leader TEXT NOT NULL,member_count INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_staff_directory (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,role TEXT NOT NULL,departments_json TEXT NOT NULL,status TEXT NOT NULL,qualification TEXT NOT NULL,joined_at TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_contracts (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,contract_no TEXT NOT NULL,elder_name TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,version_no INTEGER NOT NULL,file_name TEXT NOT NULL,signed_at TEXT,valid_until TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_subsidies (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,elder_name TEXT NOT NULL,year_month TEXT NOT NULL,record_count INTEGER NOT NULL,total_cents INTEGER NOT NULL,voucher_cents INTEGER NOT NULL,status TEXT NOT NULL,return_reason TEXT,submitted_at TEXT,package_name TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_promotion_assets (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,title TEXT NOT NULL,elder_name TEXT NOT NULL,consent_status TEXT NOT NULL,review_status TEXT NOT NULL,file_name TEXT NOT NULL,source_stage TEXT NOT NULL,downloadable INTEGER NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_food_traces (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,service_date TEXT NOT NULL,ingredient TEXT NOT NULL,supplier TEXT NOT NULL,batch_no TEXT NOT NULL,certificate TEXT NOT NULL,responsible TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,flow_type TEXT NOT NULL DEFAULT 'PURCHASE_IN',quantity TEXT NOT NULL DEFAULT '',evidence_ids_json TEXT NOT NULL DEFAULT '[]',voice_media_id TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL DEFAULT '',reviewed_by TEXT NOT NULL DEFAULT '',reviewed_at TEXT NOT NULL DEFAULT '',return_reason TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS demo_engagements (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,elder_name TEXT NOT NULL,mode TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL,responsible TEXT NOT NULL,frequency TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_archives (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,retention_until TEXT NOT NULL,legal_hold INTEGER NOT NULL,export_status TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_org_settings (tenant_id TEXT PRIMARY KEY,organization_name TEXT NOT NULL,location_radius_meters INTEGER NOT NULL,time_tolerance_minutes INTEGER NOT NULL,evidence_retention_years INTEGER NOT NULL,contract_retention TEXT NOT NULL,attendance_enabled INTEGER NOT NULL DEFAULT 1,food_trace_enabled INTEGER NOT NULL DEFAULT 1,customer_feedback_enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_attendance_records (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,staff_id TEXT NOT NULL,work_date TEXT NOT NULL,check_in_at TEXT,check_out_at TEXT,location_status TEXT NOT NULL,exception_status TEXT NOT NULL,note TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,staff_id,work_date));
      CREATE TABLE IF NOT EXISTS demo_business_media (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,business_type TEXT NOT NULL,business_id TEXT NOT NULL,media_type TEXT NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,duration_seconds INTEGER NOT NULL,data_url TEXT NOT NULL,uploaded_by TEXT NOT NULL,is_test INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_performance_schemes (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,version_no INTEGER NOT NULL,status TEXT NOT NULL,effective_from TEXT NOT NULL,created_at TEXT NOT NULL,scope_departments_json TEXT NOT NULL DEFAULT '[]',UNIQUE(tenant_id,version_no));
      CREATE TABLE IF NOT EXISTS demo_performance_rules (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,scheme_id TEXT NOT NULL,metric_code TEXT NOT NULL,label TEXT NOT NULL,points_per_unit REAL NOT NULL,unit_label TEXT NOT NULL,enabled INTEGER NOT NULL,sort_order INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_sales_records (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,staff_id TEXT NOT NULL,item_name TEXT NOT NULL,quantity INTEGER NOT NULL,amount_cents INTEGER NOT NULL,sold_at TEXT NOT NULL,status TEXT NOT NULL,confirmed_at TEXT,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_performance_statements (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,staff_id TEXT NOT NULL,year_month TEXT NOT NULL,scheme_id TEXT NOT NULL,scheme_version INTEGER NOT NULL,scheme_name TEXT NOT NULL,status TEXT NOT NULL,scheme_snapshot_json TEXT NOT NULL,lines_json TEXT NOT NULL,adjustments_json TEXT NOT NULL,base_points REAL NOT NULL,adjustment_points REAL NOT NULL,total_points REAL NOT NULL,calculated_at TEXT NOT NULL,confirmed_at TEXT,UNIQUE(tenant_id,staff_id,year_month));
    `);
    const settingColumns = this.db.prepare("PRAGMA table_info(demo_org_settings)").all() as Array<{ name: string }>;
    for (const [name, definition] of [
      ["attendance_enabled", "INTEGER NOT NULL DEFAULT 1"],
      ["food_trace_enabled", "INTEGER NOT NULL DEFAULT 1"],
      ["customer_feedback_enabled", "INTEGER NOT NULL DEFAULT 1"],
    ] as Array<[string, string]>) if (!settingColumns.some((column) => column.name === name)) this.db.exec(`ALTER TABLE demo_org_settings ADD COLUMN ${name} ${definition}`);
    const foodColumns = this.db.prepare("PRAGMA table_info(demo_food_traces)").all() as Array<{ name: string }>;
    for (const [name, definition] of [
      ["flow_type", "TEXT NOT NULL DEFAULT 'PURCHASE_IN'"], ["quantity", "TEXT NOT NULL DEFAULT ''"],
      ["evidence_ids_json", "TEXT NOT NULL DEFAULT '[]'"], ["voice_media_id", "TEXT NOT NULL DEFAULT ''"],
      ["created_by", "TEXT NOT NULL DEFAULT ''"], ["reviewed_by", "TEXT NOT NULL DEFAULT ''"],
      ["reviewed_at", "TEXT NOT NULL DEFAULT ''"], ["return_reason", "TEXT NOT NULL DEFAULT ''"],
      ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ] as Array<[string, string]>) if (!foodColumns.some((column) => column.name === name)) this.db.exec(`ALTER TABLE demo_food_traces ADD COLUMN ${name} ${definition}`);
    const performanceSchemeColumns = this.db.prepare("PRAGMA table_info(demo_performance_schemes)").all() as Array<{ name: string }>;
    if (!performanceSchemeColumns.some((column) => column.name === "scope_departments_json")) {
      this.db.exec("ALTER TABLE demo_performance_schemes ADD COLUMN scope_departments_json TEXT NOT NULL DEFAULT '[]'");
    }
  }

  private seed() {
    const tenant = "tenant-lanzhou-pilot";
    const stamp = "2026-08-09T09:00:00.000+08:00";
    this.db
      .prepare("INSERT OR IGNORE INTO demo_departments VALUES (?,?,?,?,?,?,?)")
      .run("dept-care", tenant, "护理部", "周主管", 8, "ACTIVE", stamp);
    this.db
      .prepare("INSERT OR IGNORE INTO demo_departments VALUES (?,?,?,?,?,?,?)")
      .run("dept-service", tenant, "服务部", "王主管", 6, "ACTIVE", stamp);
    this.db
      .prepare("INSERT OR IGNORE INTO demo_departments VALUES (?,?,?,?,?,?,?)")
      .run("dept-food", tenant, "餐饮部", "陈主管", 4, "ACTIVE", stamp);
    const staff = this.db.prepare(
      "INSERT OR IGNORE INTO demo_staff_directory VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    staff.run(
      "staff-lz-001",
      tenant,
      "刘阿姨",
      "13800001001",
      "服务负责人",
      JSON.stringify(["护理部", "服务部", "餐饮部"]),
      "ACTIVE",
      "健康服务资质已核验",
      "2025-03-01",
      stamp,
    );
    this.db.prepare(
      "UPDATE demo_staff_directory SET departments_json=? WHERE tenant_id=? AND id=?",
    ).run(JSON.stringify(["护理部", "上门服务组"]), tenant, "staff-lz-001");
    staff.run(
      "staff-lz-002",
      tenant,
      "赵阿姨",
      "13800001002",
      "协作人员",
      JSON.stringify(["服务部"]),
      "ACTIVE",
      "基础照护",
      "2025-06-15",
      stamp,
    );
    staff.run(
      "staff-lz-003",
      tenant,
      "陈师傅",
      "13800001003",
      "餐饮负责人",
      JSON.stringify(["餐饮部"]),
      "ACTIVE",
      "健康证有效",
      "2024-11-20",
      stamp,
    );
    this.db
      .prepare(
        "INSERT OR IGNORE INTO demo_contracts VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "contract-001",
        tenant,
        "HT-2026-0001",
        "张奶奶",
        "居家养老上门服务合同",
        "SIGNED",
        2,
        "居家养老上门服务合同.pdf",
        stamp,
        "2027-07-31",
        stamp,
      );
    this.db
      .prepare(
        "INSERT OR IGNORE INTO demo_subsidies VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "subsidy-001",
        tenant,
        "张奶奶",
        "2026-08",
        4,
        60000,
        60000,
        "READY",
        null,
        null,
        "张奶奶-2026-08-核销材料包.zip",
        stamp,
      );
    this.db
      .prepare(
        "INSERT OR IGNORE INTO demo_promotion_assets VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "asset-001",
        tenant,
        "上门助洁服务记录",
        "张奶奶",
        "VALID",
        "PENDING",
        "服务后现场照片.jpg",
        "服务后",
        0,
        stamp,
      );
    this.db
      .prepare(
        `INSERT OR IGNORE INTO demo_food_traces
         (id,tenant_id,service_date,ingredient,supplier,batch_no,certificate,responsible,status,created_at,
          flow_type,quantity,evidence_ids_json,voice_media_id,created_by,reviewed_by,reviewed_at,return_reason,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        "food-001",
        tenant,
        "2026-08-09",
        "土豆",
        "兰州安心农产品配送中心",
        "PC-20260809-01",
        "进货票据已登记",
        "陈师傅",
        "VERIFIED",
        stamp,
        "PURCHASE_IN",
        "20千克，午餐使用",
        "[]",
        "",
        "staff-lz-003",
        "tenant-admin-lz",
        stamp,
        "",
        stamp,
      );
    this.db.prepare(
      "UPDATE demo_food_traces SET created_by=?, responsible=?, status='VERIFIED' WHERE tenant_id=? AND id=?",
    ).run("staff-lz-003", "陈师傅", tenant, "food-001");
    this.db
      .prepare(
        "INSERT OR IGNORE INTO demo_engagements VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "engagement-001",
        tenant,
        "李爷爷",
        "PERIODIC_HOME_VISIT",
        "2026-08-01",
        "长期",
        "ACTIVE",
        "刘阿姨",
        "每周一次",
        stamp,
      );
    this.db
      .prepare("INSERT OR IGNORE INTO demo_archives VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "archive-001",
        tenant,
        "履约档案",
        "张奶奶 2026年8月服务档案",
        "2029-08-31",
        0,
        "NOT_REQUESTED",
        stamp,
      );
    this.db
      .prepare("INSERT OR IGNORE INTO demo_archives VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "archive-002",
        tenant,
        "合同档案",
        "HT-2026-0001",
        "永久",
        0,
        "NOT_REQUESTED",
        stamp,
      );
    this.db.prepare(`INSERT OR IGNORE INTO demo_org_settings
      (tenant_id,organization_name,location_radius_meters,time_tolerance_minutes,evidence_retention_years,contract_retention,
       attendance_enabled,food_trace_enabled,customer_feedback_enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(tenant, "兰州试点机构", 300, 30, 3, "永久", 1, 1, 1, stamp);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO demo_performance_schemes
         (id,tenant_id,name,version_no,status,effective_from,created_at,scope_departments_json)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        "points-scheme-lz-v1",
        tenant,
        "试点门店基础积分方案",
        1,
        "PUBLISHED",
        "2026-08-01",
        stamp,
        JSON.stringify(["护理部", "服务部", "上门服务组"]),
      );
    this.db.prepare(
      "UPDATE demo_performance_schemes SET scope_departments_json=? WHERE tenant_id=? AND id=?",
    ).run(JSON.stringify(["护理部", "服务部", "上门服务组"]), tenant, "points-scheme-lz-v1");
    this.db.prepare(
      `INSERT OR IGNORE INTO demo_performance_schemes
       (id,tenant_id,name,version_no,status,effective_from,created_at,scope_departments_json)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      "points-scheme-food-v1",
      tenant,
      "餐饮合规记录积分（演示）",
      2,
      "PUBLISHED",
      "2026-08-01",
      stamp,
      JSON.stringify(["餐饮部"]),
    );
    const pointsRule = this.db.prepare(
      "INSERT OR IGNORE INTO demo_performance_rules VALUES (?,?,?,?,?,?,?,?,?)",
    );
    const seededPointRules: Array<[string, string, string, number, string]> = [
      ["points-rule-1", "TASK_RESPONSIBLE_APPROVED", "负责人完成任务", 10, "单"],
      ["points-rule-2", "TASK_COLLABORATOR_APPROVED", "协作完成任务", 4, "单"],
      ["points-rule-3", "SERVICE_DAY", "实际服务天数", 2, "天"],
      ["points-rule-4", "SALE_CONFIRMED", "确认销售单", 8, "单"],
      ["points-rule-5", "SALE_AMOUNT_100", "确认销售金额", 1, "每100元"],
    ];
    seededPointRules.forEach((rule, index) =>
      pointsRule.run(
        rule[0], tenant, "points-scheme-lz-v1", rule[1], rule[2], rule[3], rule[4], 1, index,
      ),
    );
    pointsRule.run(
      "points-rule-food-1", tenant, "points-scheme-food-v1", "FOOD_TRACE_VERIFIED",
      "食品流转记录复核通过", 2, "批", 1, 0,
    );
    pointsRule.run(
      "points-rule-food-2", tenant, "points-scheme-food-v1", "FOOD_TRACE_DAY",
      "当日溯源记录完整", 3, "天", 1, 1,
    );
    const sale = this.db.prepare(
      "INSERT OR IGNORE INTO demo_sales_records VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    sale.run("sale-lz-001", tenant, "staff-lz-001", "居家防滑扶手", 1, 29900, "2026-08-07", "CONFIRMED", stamp, stamp);
    sale.run("sale-lz-002", tenant, "staff-lz-002", "睡眠监测垫", 1, 68000, "2026-08-08", "PENDING", null, stamp);
    sale.run("sale-lz-003", tenant, "staff-lz-003", "营养补充组合", 2, 39800, "2026-08-09", "CONFIRMED", stamp, stamp);
  }
}

function now() {
  return new Date().toISOString();
}
function text(value: unknown, fallback: string) {
  const result = String(value ?? "").trim();
  return (result || fallback).slice(0, 300);
}
function required(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label}不能为空`);
  return result.slice(0, 120);
}
function parse<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function normalizeMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 7);
}
