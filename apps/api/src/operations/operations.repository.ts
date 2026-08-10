import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TenantStatus = "ACTIVE" | "READ_ONLY" | "SUSPENDED";
export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "RETURNED"
  | "APPROVED";
export type StageCode = "BEFORE" | "DURING" | "AFTER";

export const fallbackServiceForm = {
  id: "fallback-service-form",
  name: "门店服务记录表",
  version: 1,
  status: "PUBLISHED",
  fields: [
    {
      id: "preset-result-default",
      presetCode: "SERVICE_RESULT",
      source: "PRESET",
      type: "LONG_TEXT",
      label: "服务结果总结",
      description: "",
      required: true,
      enabled: true,
      order: 0,
      qualificationCodes: [],
      options: [],
      evidenceStage: "AFTER" as const,
    },
  ],
};

type StageValue = {
  note: string;
  recordedAt: string;
  locationStatus: "SIMULATED" | "DENIED";
  evidence: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
    isTestData: true;
    uploadedBy: string;
    createdAt: string;
    fieldId?: string;
  }>;
};

type TaskRow = {
  id: string;
  tenant_id: string;
  elder_name: string;
  archive_no: string;
  scheduled_at: string;
  service_items_json: string;
  responsible_id: string;
  participant_ids_json: string;
  status: TaskStatus;
  revision_no: number;
  return_reason: string | null;
  return_issues_json: string;
  template_snapshot_json: string;
  stages_json: string;
  answers_json: string;
  updated_at: string;
};

export class OperationsRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath = process.env.LOCAL_SQLITE_PATH?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LOCAL_SQLITE_FORBIDDEN_IN_PRODUCTION");
    }
    const file = resolve(databasePath || ".local-data/care-dev.sqlite");
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureSchema();
    this.seed();
  }

  close(): void {
    this.db.close();
  }

  listTenants(): unknown[] {
    return this.db
      .prepare(
        `SELECT * FROM demo_tenants ORDER BY created_at`,
      )
      .all()
      .map((row) => this.mapTenant(row as Record<string, unknown>));
  }

  listSubscriptionPlans(): unknown[] {
    return this.db
      .prepare(
        `SELECT code, name, monthly_price_cents, staff_limit, elder_limit,
                storage_mb, description, features_json, sort_order
           FROM demo_subscription_plans
          ORDER BY sort_order, monthly_price_cents`,
      )
      .all()
      .map((row) => {
        const value = row as Record<string, unknown>;
        return {
          code: String(value.code),
          name: String(value.name),
          monthlyPriceCents: Number(value.monthly_price_cents),
          staffLimit: Number(value.staff_limit),
          elderLimit: Number(value.elder_limit),
          storageMb: Number(value.storage_mb),
          description: String(value.description),
          features: JSON.parse(String(value.features_json)) as string[],
          isSimulation: true,
        };
      });
  }

  listQualifications(): unknown[] {
    const table = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_service_form_workspace'")
      .get();
    if (!table) return [];
    const rows = this.db.prepare(
      `SELECT w.tenant_id, t.name AS tenant_name, w.qualifications_json
         FROM local_service_form_workspace w
         JOIN demo_tenants t ON t.id = w.tenant_id
        ORDER BY t.name`,
    ).all() as Array<Record<string, unknown>>;
    return rows.flatMap((row) =>
      (JSON.parse(String(row.qualifications_json || "[]")) as Array<Record<string, unknown>>)
        .map((item) => ({
          tenantId: String(row.tenant_id),
          tenantName: String(row.tenant_name),
          code: String(item.code),
          name: String(item.name),
          status: String(item.status || "MISSING"),
          uploadStatus: item.mockDocumentName ? "UPLOADED" : "NOT_UPLOADED",
          fileName: item.mockDocumentName ? String(item.mockDocumentName) : undefined,
          validUntil: item.validUntil ? String(item.validUntil) : undefined,
          submittedAt: item.submittedAt ? String(item.submittedAt) : undefined,
          reviewedAt: item.reviewedAt ? String(item.reviewedAt) : undefined,
          reviewedBy: item.reviewedBy ? String(item.reviewedBy) : undefined,
          rejectionReason: item.rejectionReason ? String(item.rejectionReason) : undefined,
        })),
    );
  }

  reviewQualification(
    tenantId: string,
    code: string,
    input: Record<string, unknown>,
    actorId: string,
  ): unknown | null {
    const row = this.db.prepare(
      "SELECT qualifications_json FROM local_service_form_workspace WHERE tenant_id = ?",
    ).get(tenantId) as { qualifications_json: string } | undefined;
    if (!row) return null;
    const items = JSON.parse(row.qualifications_json) as Array<Record<string, unknown>>;
    const target = items.find((item) => String(item.code) === code);
    if (!target) return null;
    const action = String(input.action) === "APPROVE" ? "APPROVE" : "REJECT";
    if (!target.mockDocumentName || String(target.status) !== "PENDING") {
      throw new Error("QUALIFICATION_NOT_REVIEWABLE");
    }
    const reason = String(input.reason || "").trim().slice(0, 500);
    if (action === "REJECT" && !reason) throw new Error("QUALIFICATION_REJECTION_REASON_REQUIRED");
    target.status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    target.reviewedAt = new Date().toISOString();
    target.reviewedBy = actorId;
    if (action === "APPROVE") {
      target.validUntil = String(input.validUntil || target.validUntil || "2027-12-31");
      delete target.rejectionReason;
    } else {
      target.rejectionReason = reason;
    }
    this.db.prepare(
      `UPDATE local_service_form_workspace SET qualifications_json = ?, updated_at = ? WHERE tenant_id = ?`,
    ).run(JSON.stringify(items), new Date().toISOString(), tenantId);
    this.audit(actorId, tenantId, action === "APPROVE" ? "QUALIFICATION_APPROVE" : "QUALIFICATION_REJECT", "organization_qualification", code, "SUCCESS", reason || null);
    return this.listQualifications().find((item) => {
      const value = item as Record<string, unknown>;
      return value.tenantId === tenantId && value.code === code;
    }) || null;
  }

  getTenant(id: string): ReturnType<OperationsRepository["mapTenant"]> | null {
    const row = this.db
      .prepare(
        `SELECT * FROM demo_tenants WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapTenant(row) : null;
  }

  createTenant(input: Record<string, unknown>, actorId: string): unknown {
    const id = `tenant-demo-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const name = String(input.name || "新接入机构").slice(0, 120);
    const validUntil = String(input.validUntil || "2027-08-31");
    const plan = this.subscriptionPlan(String(input.planCode || "DEMO_FREE"));
    const capacityMb = Math.max(
      100,
      Number(input.capacityMb) || Number(plan?.storage_mb) || 2048,
    );
    this.db
      .prepare(
        `INSERT INTO demo_tenants
          (id, name, status, valid_until, capacity_mb, used_bytes, staff_count,
           renewal_status, created_at, updated_at)
         VALUES (?, ?, 'ACTIVE', ?, ?, 0, 0, 'TRIAL', ?, ?)`,
      )
      .run(id, name, validUntil, capacityMb, now, now);
    this.updateTenantProfile(id, input);
    this.assignSubscription(id, String(plan?.code || "DEMO_FREE"), now);
    this.audit(actorId, id, "TENANT_CREATE", "tenant", id, "SUCCESS", name);
    return this.getTenant(id);
  }

  updateTenant(
    id: string,
    input: Record<string, unknown>,
    actorId: string,
  ): unknown | null {
    const current = this.getTenant(id);
    if (!current) return null;
    const status = ["ACTIVE", "READ_ONLY", "SUSPENDED"].includes(
      String(input.status),
    )
      ? String(input.status)
      : current.status;
    const validUntil = String(input.validUntil || current.validUntil);
    const capacityMb = Math.max(
      100,
      Number(input.capacityMb) || current.capacityMb,
    );
    const renewalStatus = ["TRIAL", "ACTIVE", "OVERDUE"].includes(
      String(input.renewalStatus),
    )
      ? String(input.renewalStatus)
      : current.renewalStatus;
    const planCode = this.subscriptionPlan(String(input.planCode || current.subscription.planCode))
      ? String(input.planCode || current.subscription.planCode)
      : current.subscription.planCode;
    this.db
      .prepare(
        `UPDATE demo_tenants
            SET status = ?, valid_until = ?, capacity_mb = ?, renewal_status = ?,
                updated_at = ? WHERE id = ?`,
      )
      .run(
        status,
        validUntil,
        capacityMb,
        renewalStatus,
        new Date().toISOString(),
        id,
      );
    this.updateTenantProfile(id, input);
    if (planCode !== current.subscription.planCode) {
      this.assignSubscription(id, planCode, new Date().toISOString());
      this.audit(
        actorId,
        id,
        "SUBSCRIPTION_PLAN_ASSIGN",
        "subscription",
        id,
        "SUCCESS",
        planCode,
      );
    }
    this.audit(
      actorId,
      id,
      "TENANT_CONFIG_UPDATE",
      "tenant",
      id,
      "SUCCESS",
      JSON.stringify({ status, validUntil, capacityMb, renewalStatus, planCode }),
    );
    return this.getTenant(id);
  }

  assertTenantActive(tenantId: string): void {
    const tenant = this.getTenant(tenantId);
    if (!tenant || tenant.status === "SUSPENDED") {
      throw new Error("TENANT_SUSPENDED");
    }
  }

  listTasks(tenantId: string, actorId?: string): unknown[] {
    this.assertTenantActive(tenantId);
    const rows = this.db
      .prepare(
        `SELECT * FROM demo_staff_tasks
          WHERE tenant_id = ?
            AND (? IS NULL OR responsible_id = ? OR participant_ids_json LIKE ?)
          ORDER BY scheduled_at`,
      )
      .all(tenantId, actorId || null, actorId || null, `%${actorId || ""}%`) as TaskRow[];
    return rows.map((row) => this.mapTask(row));
  }

  getTask(tenantId: string, taskId: string): unknown | null {
    this.assertTenantActive(tenantId);
    const row = this.db
      .prepare("SELECT * FROM demo_staff_tasks WHERE tenant_id = ? AND id = ?")
      .get(tenantId, taskId) as TaskRow | undefined;
    return row ? this.mapTask(row) : null;
  }

  getCustomerFeedback(tenantId: string, taskId: string, actorId?: string): unknown | null {
    this.assertTenantActive(tenantId);
    const task = this.db.prepare(
      "SELECT responsible_id, participant_ids_json, template_snapshot_json FROM demo_staff_tasks WHERE tenant_id=? AND id=?",
    ).get(tenantId, taskId) as Record<string, unknown> | undefined;
    if (!task) return null;
    if (actorId) {
      const participants = JSON.parse(String(task.participant_ids_json || "[]")) as string[];
      if (String(task.responsible_id) !== actorId && !participants.includes(actorId)) {
        throw new Error("TASK_PARTICIPANT_REQUIRED");
      }
    }
    const template = JSON.parse(String(task.template_snapshot_json || "{}")) as {
      fields?: Array<Record<string, unknown>>;
    };
    const field = (template.fields || []).find((item) => item.type === "CUSTOMER_FEEDBACK" && item.enabled !== false);
    const row = this.db.prepare(
      "SELECT * FROM demo_task_customer_feedback WHERE tenant_id=? AND task_id=?",
    ).get(tenantId, taskId) as Record<string, unknown> | undefined;
    const mediaIds = row ? JSON.parse(String(row.media_ids_json || "[]")) as string[] : [];
    const media = mediaIds.length ? this.db.prepare(
      `SELECT id,media_type,file_name,mime_type,size_bytes,duration_seconds,data_url,created_at
         FROM demo_business_media WHERE tenant_id=? AND id IN (${mediaIds.map(() => "?").join(",")})`,
    ).all(tenantId, ...mediaIds).map((item: Record<string, unknown>) => ({
      id: String(item.id), mediaType: String(item.media_type), fileName: String(item.file_name),
      mimeType: String(item.mime_type), sizeBytes: Number(item.size_bytes),
      durationSeconds: Number(item.duration_seconds), dataUrl: String(item.data_url),
      createdAt: String(item.created_at), isTest: true,
    })) : [];
    return {
      enabled: Boolean(field) && this.customerFeedbackApplicationEnabled(tenantId),
      field: field || null,
      feedback: row ? {
        id: String(row.id), taskId, revision: Number(row.revision_no), status: String(row.status),
        evaluatorType: String(row.evaluator_type), relationship: String(row.relationship),
        satisfaction: String(row.satisfaction), tags: JSON.parse(String(row.tags_json || "[]")),
        text: String(row.feedback_text), captureMode: String(row.capture_mode),
        refusalReason: String(row.refusal_reason), mediaIds, media,
        enteredBy: String(row.entered_by), updatedAt: String(row.updated_at),
      } : null,
    };
  }

  saveCustomerFeedback(tenantId: string, taskId: string, input: Record<string, unknown>, actorId: string): unknown | null {
    this.assertTenantActive(tenantId);
    const task = this.db.prepare(
      "SELECT * FROM demo_staff_tasks WHERE tenant_id=? AND id=?",
    ).get(tenantId, taskId) as TaskRow | undefined;
    if (!task) return null;
    if (!["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(task.status)) throw new Error("TASK_NOT_EDITABLE");
    const participants = JSON.parse(task.participant_ids_json) as string[];
    if (task.responsible_id !== actorId && !participants.includes(actorId)) throw new Error("TASK_PARTICIPANT_REQUIRED");
    const context = this.getCustomerFeedback(tenantId, taskId) as { enabled: boolean };
    if (!context.enabled) throw new Error("CUSTOMER_FEEDBACK_DISABLED");
    const mediaIds = Array.isArray(input.mediaIds) ? input.mediaIds.map(String).filter(Boolean).slice(0, 10) : [];
    if (mediaIds.length) {
      const placeholders = mediaIds.map(() => "?").join(",");
      const count = (this.db.prepare(
        `SELECT COUNT(*) AS value FROM demo_business_media WHERE tenant_id=? AND uploaded_by=? AND id IN (${placeholders})`,
      ).get(tenantId, actorId, ...mediaIds) as { value: number }).value;
      if (Number(count) !== mediaIds.length) throw new Error("CUSTOMER_FEEDBACK_MEDIA_INVALID");
    }
    const id = `feedback-${randomUUID().slice(0, 10)}`;
    const timestamp = new Date().toISOString();
    this.db.prepare(`INSERT INTO demo_task_customer_feedback
      (id,tenant_id,task_id,revision_no,status,evaluator_type,relationship,satisfaction,tags_json,
       feedback_text,capture_mode,refusal_reason,media_ids_json,entered_by,updated_at)
      VALUES (?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id,task_id) DO UPDATE SET
       revision_no=excluded.revision_no,status='DRAFT',evaluator_type=excluded.evaluator_type,
       relationship=excluded.relationship,satisfaction=excluded.satisfaction,tags_json=excluded.tags_json,
       feedback_text=excluded.feedback_text,capture_mode=excluded.capture_mode,
       refusal_reason=excluded.refusal_reason,media_ids_json=excluded.media_ids_json,
       entered_by=excluded.entered_by,updated_at=excluded.updated_at`).run(
      id, tenantId, taskId, task.revision_no,
      String(input.evaluatorType || "ELDER"), String(input.relationship || "本人").slice(0, 100),
      String(input.satisfaction || ""), JSON.stringify(Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : []),
      String(input.text || "").trim().slice(0, 2000), String(input.captureMode || "STAFF_ENTERED"),
      String(input.refusalReason || "").trim().slice(0, 500), JSON.stringify(mediaIds), actorId, timestamp,
    );
    this.audit(actorId, tenantId, "CUSTOMER_FEEDBACK_SAVE", "service_task", taskId, "SUCCESS", null);
    return this.getCustomerFeedback(tenantId, taskId, actorId);
  }

  createTask(tenantId: string, input: Record<string, unknown>, actorId: string): unknown {
    this.assertTenantActive(tenantId);
    const elderName = String(input.elderName || "").trim();
    const archiveNo = String(input.archiveNo || "").trim();
    const scheduledAt = String(input.scheduledAt || "").trim();
    const serviceItems = Array.isArray(input.serviceItems) ? input.serviceItems.map(String).filter(Boolean) : [];
    const responsibleId = String(input.responsibleId || "").trim();
    const participantIds = Array.isArray(input.participantIds) ? input.participantIds.map(String).filter(Boolean) : [];
    if (!elderName || !archiveNo || !scheduledAt) throw new Error("TASK_BASIC_INFO_REQUIRED");
    if (!serviceItems.length) throw new Error("SERVICE_ITEM_REQUIRED");
    this.assertServiceQualifications(tenantId, serviceItems);
    if (!responsibleId) throw new Error("RESPONSIBLE_REQUIRED");
    if (participantIds.includes(responsibleId)) throw new Error("RESPONSIBLE_DUPLICATED");
    const id = `task-${randomUUID().slice(0, 10)}`;
    const timestamp = new Date().toISOString();
    const templateSnapshot = this.getPublishedForm(tenantId) || fallbackServiceForm;
    this.db.prepare(`INSERT INTO demo_staff_tasks
      (id,tenant_id,elder_name,archive_no,scheduled_at,service_items_json,responsible_id,
       participant_ids_json,status,revision_no,return_reason,return_issues_json,
       template_snapshot_json,stages_json,answers_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,'NOT_STARTED',1,NULL,'[]',?,'{}','{}',?)`).run(
      id, tenantId, elderName, archiveNo, scheduledAt, JSON.stringify(serviceItems), responsibleId,
      JSON.stringify(participantIds), JSON.stringify(templateSnapshot), timestamp,
    );
    this.audit(actorId, tenantId, "TASK_CREATE", "service_task", id, "SUCCESS", serviceItems.join("、"));
    return this.getTask(tenantId, id);
  }

  saveStage(
    tenantId: string,
    taskId: string,
    stage: StageCode,
    input: Record<string, unknown>,
    actorId: string,
  ): unknown | null {
    this.assertTenantActive(tenantId);
    const row = this.db
      .prepare("SELECT * FROM demo_staff_tasks WHERE tenant_id = ? AND id = ?")
      .get(tenantId, taskId) as TaskRow | undefined;
    if (!row) return null;
    if (!["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(row.status)) {
      throw new Error("TASK_NOT_EDITABLE");
    }
    const participants = JSON.parse(row.participant_ids_json) as string[];
    if (row.responsible_id !== actorId && !participants.includes(actorId)) {
      throw new Error("TASK_PARTICIPANT_REQUIRED");
    }
    const stages = JSON.parse(row.stages_json) as Partial<Record<StageCode, StageValue>>;
    const answers = JSON.parse(row.answers_json || "{}") as Record<string, unknown>;
    const storedTemplate = JSON.parse(row.template_snapshot_json || "{}") as {
      fields?: Array<{ id: string; type: string }>;
    };
    const taskTemplate = Array.isArray(storedTemplate.fields)
      ? storedTemplate
      : ((this.getPublishedForm(tenantId) as {
          fields?: Array<{ id: string; type: string }>;
        } | null) || { fields: [] });
    const returnIssues = JSON.parse(row.return_issues_json || "[]") as Array<
      Record<string, unknown>
    >;
    if (typeof input.answers === "object" && input.answers !== null) {
      Object.assign(answers, input.answers);
    }
    const evidenceInput = Array.isArray(input.evidence) ? input.evidence : [];
    const evidence = evidenceInput.slice(0, 6).map((item) => {
      const value = item as Record<string, unknown>;
      const mimeType = String(value.mimeType || "");
      const dataUrl = String(value.dataUrl || "");
      const sizeBytes = Number(value.sizeBytes) || 0;
      if (
        !mimeType.startsWith("image/") ||
        !dataUrl.startsWith(`data:${mimeType};base64,`) ||
        sizeBytes < 1 ||
        sizeBytes > 5 * 1024 * 1024
      ) {
        throw new Error("INVALID_TEST_EVIDENCE");
      }
      return {
        id: `evidence-${randomUUID().slice(0, 10)}`,
        fileName: String(value.fileName || "test-image.jpg").slice(0, 180),
        mimeType,
        sizeBytes,
        dataUrl,
        isTestData: true as const,
        uploadedBy: actorId,
        createdAt: new Date().toISOString(),
        ...(value.fieldId ? { fieldId: String(value.fieldId) } : {}),
      };
    });
    if (row.status === "RETURNED") {
      this.db.prepare(`INSERT INTO demo_task_history
        (id,task_id,tenant_id,revision_no,status,snapshot_json,reason,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        `history-${randomUUID()}`, taskId, tenantId, row.revision_no, "CORRECTION_STARTED",
        JSON.stringify(this.mapTask(row)), `修改${stage === "BEFORE" ? "服务前" : stage === "DURING" ? "服务中" : "服务后"}记录`, new Date().toISOString(),
      );
    }
    stages[stage] = {
      note: String(input.note || "").slice(0, 1000),
      recordedAt: new Date().toISOString(),
      locationStatus: input.locationStatus === "DENIED" ? "DENIED" : "SIMULATED",
      evidence,
    };
    const nextStatus: TaskStatus =
      row.status === "RETURNED" ? "RETURNED" : "IN_PROGRESS";
    const updatedIssues = returnIssues.map((issue) => {
      if (issue.stage !== stage) return issue;
      if (!issue.fieldId) return { ...issue, resolved: true };
      const fieldId = String(issue.fieldId);
      const field = (taskTemplate.fields || []).find((item) => item.id === fieldId);
      const value = answers[fieldId];
      const hasAnswer =
        value !== undefined &&
        value !== null &&
        value !== "" &&
        (!Array.isArray(value) || value.length > 0);
      const hasEvidence =
        field?.type === "IMAGE" &&
        evidence.some((item) => !item.fieldId || item.fieldId === fieldId);
      return hasAnswer || hasEvidence ? { ...issue, resolved: true } : issue;
    });
    this.db
      .prepare(
        `UPDATE demo_staff_tasks SET stages_json = ?, answers_json = ?, return_issues_json = ?, status = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ?`,
      )
      .run(
        JSON.stringify(stages),
        JSON.stringify(answers),
        JSON.stringify(updatedIssues),
        nextStatus,
        new Date().toISOString(),
        tenantId,
        taskId,
      );
    this.addUsedBytes(tenantId, evidence.reduce((sum, item) => sum + item.sizeBytes, 0));
    this.audit(actorId, tenantId, "TASK_STAGE_SAVE", "service_task", taskId, "SUCCESS", stage);
    return this.getTask(tenantId, taskId);
  }

  submitTask(tenantId: string, taskId: string, actorId: string): unknown | null {
    this.assertTenantActive(tenantId);
    const row = this.db
      .prepare("SELECT * FROM demo_staff_tasks WHERE tenant_id = ? AND id = ?")
      .get(tenantId, taskId) as TaskRow | undefined;
    if (!row) return null;
    if (!["IN_PROGRESS", "RETURNED"].includes(row.status)) {
      throw new Error("TASK_NOT_EDITABLE");
    }
    if (row.responsible_id !== actorId) throw new Error("TASK_OWNER_REQUIRED");
    const stages = JSON.parse(row.stages_json) as Partial<Record<StageCode, StageValue>>;
    const missing = (["BEFORE", "DURING", "AFTER"] as StageCode[]).filter(
      (stage) => !stages[stage],
    );
    if (missing.length) throw new Error(`MISSING_STAGES:${missing.join(",")}`);
    const storedTemplate = JSON.parse(row.template_snapshot_json || "{}") as { fields?: Array<{ id: string; label: string; type: string; required: boolean; enabled: boolean; evidenceStage?: StageCode; feedbackConfig?: Record<string, unknown> }> };
    const template = Array.isArray(storedTemplate.fields)
      ? storedTemplate
      : ((this.getPublishedForm(tenantId) as typeof storedTemplate | null) || { fields: [] });
    const answers = JSON.parse(row.answers_json || "{}") as Record<string, unknown>;
    const missingFields = (template?.fields || []).filter((field) => {
      if (!field.enabled || !field.required) return false;
      if (field.type === "CUSTOMER_FEEDBACK") return false;
      if (field.type === "IMAGE") {
        const stage = field.evidenceStage || "DURING";
        const stageEvidence = stages[stage]?.evidence || [];
        const imageFieldsForStage = (template.fields || []).filter(
          (candidate) =>
            candidate.enabled &&
            candidate.type === "IMAGE" &&
            (candidate.evidenceStage || "DURING") === stage,
        );
        return !stageEvidence.some(
          (item) =>
            item.fieldId === field.id ||
            (!item.fieldId && imageFieldsForStage.length === 1),
        );
      }
      const value = answers[field.id];
      return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    }).map((field) => field.label);
    if (missingFields.length) throw new Error(`MISSING_REQUIRED_FIELDS:${missingFields.join("、")}`);
    const feedbackField = (template.fields || []).find((field) => field.enabled && field.type === "CUSTOMER_FEEDBACK");
    if (feedbackField && this.customerFeedbackApplicationEnabled(tenantId)) {
      this.assertCustomerFeedbackComplete(tenantId, taskId, feedbackField);
    }
    this.db
      .prepare(
        `UPDATE demo_staff_tasks
            SET status = 'PENDING_REVIEW', return_reason = NULL,
                return_issues_json = '[]', updated_at = ?
          WHERE tenant_id = ? AND id = ?`,
      )
      .run(new Date().toISOString(), tenantId, taskId);
    this.audit(actorId, tenantId, "TASK_SUBMIT", "service_task", taskId, "SUCCESS", null);
    return this.getTask(tenantId, taskId);
  }

  reviewTask(
    tenantId: string,
    taskId: string,
    action: "APPROVE" | "RETURN",
    issuesOrReason: Array<Record<string, unknown>> | string,
    actorId: string,
  ): unknown | null {
    this.assertTenantActive(tenantId);
    const row = this.db
      .prepare("SELECT * FROM demo_staff_tasks WHERE tenant_id = ? AND id = ?")
      .get(tenantId, taskId) as TaskRow | undefined;
    if (!row) return null;
    if (row.status !== "PENDING_REVIEW") throw new Error("TASK_NOT_REVIEWABLE");
    const issues = Array.isArray(issuesOrReason)
      ? issuesOrReason
      : issuesOrReason.trim()
        ? [{ stage: "AFTER", fieldLabel: "阶段记录", reason: issuesOrReason }]
        : [];
    const normalizedIssues = issues
      .map((issue) => ({
        stage: ["BEFORE", "DURING", "AFTER"].includes(String(issue.stage))
          ? String(issue.stage)
          : "AFTER",
        fieldId: issue.fieldId ? String(issue.fieldId) : undefined,
        fieldLabel: String(issue.fieldLabel || "阶段记录").trim().slice(0, 100),
        reason: String(issue.reason || "").trim().slice(0, 500),
        resolved: false,
      }))
      .filter((issue) => issue.reason);
    const storedTemplate = JSON.parse(row.template_snapshot_json || "{}") as {
      fields?: Array<{ id: string; evidenceStage?: StageCode }>;
    };
    const taskTemplate = Array.isArray(storedTemplate.fields)
      ? storedTemplate
      : ((this.getPublishedForm(tenantId) as typeof storedTemplate | null) || {
          fields: [],
        });
    const invalidFieldIssue = normalizedIssues.find((issue) => {
      if (!issue.fieldId) return false;
      const field = (taskTemplate.fields || []).find(
        (item) => item.id === issue.fieldId,
      );
      return !field || (field.evidenceStage || "DURING") !== issue.stage;
    });
    if (invalidFieldIssue) throw new Error("RETURN_FIELD_INVALID");
    if (action === "RETURN" && !normalizedIssues.length) {
      throw new Error("RETURN_REASON_REQUIRED");
    }
    const reason = normalizedIssues.map((issue) => `${issue.fieldLabel}：${issue.reason}`).join("；");
    const status = action === "APPROVE" ? "APPROVED" : "RETURNED";
    const revision = action === "RETURN" ? row.revision_no + 1 : row.revision_no;
    this.db.prepare(
      `INSERT INTO demo_task_history
        (id, task_id, tenant_id, revision_no, status, snapshot_json, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(`history-${randomUUID()}`, taskId, tenantId, row.revision_no, status, JSON.stringify(this.mapTask(row)), action === "RETURN" ? reason.trim() : "审核通过", new Date().toISOString());
    this.db
      .prepare(
        `UPDATE demo_staff_tasks SET status = ?, return_reason = ?, return_issues_json = ?, revision_no = ?,
                updated_at = ? WHERE tenant_id = ? AND id = ?`,
      )
      .run(
        status,
        action === "RETURN" ? reason : null,
        action === "RETURN" ? JSON.stringify(normalizedIssues) : "[]",
        revision,
        new Date().toISOString(),
        tenantId,
        taskId,
      );
    this.audit(actorId, tenantId, `TASK_${action}`, "service_task", taskId, "SUCCESS", reason || null);
    return this.getTask(tenantId, taskId);
  }

  createSupportGrant(tenantId: string, input: Record<string, unknown>, actorId: string): unknown {
    this.assertTenantActive(tenantId);
    const durationHours = Math.min(24, Math.max(1, Number(input.durationHours) || 4));
    const id = `grant-${randomUUID().slice(0, 10)}`;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + durationHours * 3_600_000);
    this.db
      .prepare(
        `INSERT INTO demo_support_grants
          (id, tenant_id, reason, scope, allow_download, starts_at, expires_at,
           revoked_at, issued_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        tenantId,
        String(input.reason || "协助处理机构反馈问题").slice(0, 500),
        String(input.scope || "服务任务摘要").slice(0, 200),
        input.allowDownload === true ? 1 : 0,
        startsAt.toISOString(),
        expiresAt.toISOString(),
        actorId,
        startsAt.toISOString(),
      );
    this.audit(actorId, tenantId, "SUPPORT_GRANT_CREATE", "support_grant", id, "SUCCESS", null);
    return this.listSupportGrants(tenantId).find((grant) => grant.id === id);
  }

  revokeSupportGrant(tenantId: string, id: string, actorId: string): unknown | null {
    const result = this.db
      .prepare(
        "UPDATE demo_support_grants SET revoked_at = ? WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL",
      )
      .run(new Date().toISOString(), tenantId, id);
    if (!result.changes) return null;
    this.audit(actorId, tenantId, "SUPPORT_GRANT_REVOKE", "support_grant", id, "SUCCESS", null);
    return this.listSupportGrants(tenantId).find((grant) => grant.id === id) || null;
  }

  listSupportGrants(tenantId?: string): Array<Record<string, unknown>> {
    const rows = tenantId
      ? this.db.prepare("SELECT * FROM demo_support_grants WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId)
      : this.db.prepare("SELECT * FROM demo_support_grants ORDER BY created_at DESC").all();
    const now = Date.now();
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      reason: row.reason,
      scope: row.scope,
      allowDownload: Boolean(row.allow_download),
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      issuedBy: row.issued_by,
      active: !row.revoked_at && new Date(String(row.expires_at)).getTime() > now,
    }));
  }

  listAudit(tenantId?: string): unknown[] {
    const rows = tenantId
      ? this.db.prepare("SELECT * FROM demo_audit_events WHERE tenant_id = ? ORDER BY occurred_at DESC LIMIT 200").all(tenantId)
      : this.db.prepare("SELECT * FROM demo_audit_events ORDER BY occurred_at DESC LIMIT 200").all();
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      outcome: row.outcome,
      reason: row.reason,
      occurredAt: row.occurred_at,
    }));
  }

  overview(tenantId?: string): Record<string, unknown> {
    const tenants = this.listTenants() as Array<Record<string, unknown>>;
    const grants = this.listSupportGrants(tenantId);
    const tasks = tenantId
      ? (this.listTasks(tenantId) as Array<Record<string, unknown>>)
      : [];
    return {
      tenants: tenants.length,
      suspendedTenants: tenants.filter((item) => item.status === "SUSPENDED").length,
      capacityWarnings: tenants.filter((item) => Number(item.usagePercent) >= 80).length,
      activeSupportGrants: grants.filter((item) => item.active).length,
      monthlyRecurringRevenueCents: tenants
        .filter((item) => item.status !== "SUSPENDED")
        .reduce(
          (total, item) =>
            total +
            Number(
              (item.subscription as Record<string, unknown> | undefined)
                ?.monthlyPriceCents || 0,
            ),
          0,
        ),
      pendingReview: tasks.filter((item) => item.status === "PENDING_REVIEW").length,
      returned: tasks.filter((item) => item.status === "RETURNED").length,
      inProgress: tasks.filter((item) => item.status === "IN_PROGRESS").length,
    };
  }

  getPublishedForm(tenantId: string): unknown | null {
    const table = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_service_form_workspace'")
      .get();
    if (!table) return null;
    const row = this.db
      .prepare("SELECT published_json FROM local_service_form_workspace WHERE tenant_id = ?")
      .get(tenantId) as { published_json: string | null } | undefined;
    return row?.published_json ? JSON.parse(row.published_json) : null;
  }

  private addUsedBytes(tenantId: string, bytes: number): void {
    if (!bytes) return;
    this.db.prepare("UPDATE demo_tenants SET used_bytes = used_bytes + ?, updated_at = ? WHERE id = ?")
      .run(bytes, new Date().toISOString(), tenantId);
  }

  private assertCustomerFeedbackComplete(
    tenantId: string,
    taskId: string,
    field: { label: string; required: boolean; feedbackConfig?: Record<string, unknown> },
  ): void {
    const config = field.feedbackConfig || {};
    const requiredKeys = ["satisfaction", "tags", "text", "audio", "signature", "photo", "refusalReason"]
      .filter((key) => config[key] === "REQUIRED");
    if (!field.required && !requiredKeys.length) return;
    const row = this.db.prepare(
      "SELECT * FROM demo_task_customer_feedback WHERE tenant_id=? AND task_id=?",
    ).get(tenantId, taskId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`MISSING_REQUIRED_FIELDS:${field.label}`);
    const refusalReason = String(row.refusal_reason || "").trim();
    if (refusalReason && config.refusalReason !== "DISABLED") return;
    const mediaIds = JSON.parse(String(row.media_ids_json || "[]")) as string[];
    const mediaRows = mediaIds.length ? this.db.prepare(
      `SELECT media_type FROM demo_business_media WHERE tenant_id=? AND id IN (${mediaIds.map(() => "?").join(",")})`,
    ).all(tenantId, ...mediaIds) as Array<{ media_type: string }> : [];
    const values: Record<string, boolean> = {
      satisfaction: Boolean(String(row.satisfaction || "")),
      tags: (JSON.parse(String(row.tags_json || "[]")) as unknown[]).length > 0,
      text: Boolean(String(row.feedback_text || "").trim()),
      audio: mediaRows.some((item) => item.media_type === "AUDIO"),
      signature: mediaRows.some((item) => item.media_type === "SIGNATURE"),
      photo: mediaRows.some((item) => item.media_type === "IMAGE"),
      refusalReason: Boolean(refusalReason),
    };
    const missing = requiredKeys.filter((key) => !values[key]);
    if (field.required && !requiredKeys.length && !Object.values(values).some(Boolean)) missing.push("feedback");
    if (missing.length) {
      const labels: Record<string, string> = { satisfaction: "满意度", tags: "评价标签", text: "文字意见", audio: "现场录音", signature: "手写签名", photo: "现场合照", refusalReason: "拒绝或无法评价原因", feedback: field.label };
      throw new Error(`MISSING_REQUIRED_FIELDS:${missing.map((key) => labels[key]).join("、")}`);
    }
  }

  private customerFeedbackApplicationEnabled(tenantId: string): boolean {
    const table = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='demo_org_settings'",
    ).get();
    if (!table) return true;
    const row = this.db.prepare(
      "SELECT customer_feedback_enabled AS enabled FROM demo_org_settings WHERE tenant_id=?",
    ).get(tenantId) as { enabled: number } | undefined;
    return row ? Boolean(row.enabled) : true;
  }

  private assertServiceQualifications(tenantId: string, serviceItems: string[]): void {
    const qualificationByKeywords = [
      {
        code: "HEALTH_SERVICE_OPERATION",
        keywords: ["推拿", "艾灸", "刮痧", "拔罐"],
      },
      {
        code: "REHABILITATION_SERVICE",
        keywords: ["康复训练", "肢体训练", "吞咽功能训练", "言语训练", "认知能力训练"],
      },
      {
        code: "PROFESSIONAL_NURSING",
        keywords: ["翻身", "体位变换", "压疮", "特殊皮肤护理", "排尿护理", "排便护理", "排气护理", "药物喂服"],
      },
    ];
    const requiredCodes = qualificationByKeywords
      .filter((rule) => serviceItems.some((item) => rule.keywords.some((keyword) => item.includes(keyword))))
      .map((rule) => rule.code);
    if (!requiredCodes.length) return;

    const row = this.db.prepare(
      "SELECT qualifications_json FROM local_service_form_workspace WHERE tenant_id = ?",
    ).get(tenantId) as { qualifications_json: string } | undefined;
    const qualifications = row
      ? JSON.parse(row.qualifications_json) as Array<Record<string, unknown>>
      : [];
    const today = new Date().toISOString().slice(0, 10);
    const missingCodes = requiredCodes.filter((code) => {
      const qualification = qualifications.find((item) => String(item.code) === code);
      return !qualification
        || String(qualification.status) !== "APPROVED"
        || (qualification.validUntil && String(qualification.validUntil) < today);
    });
    if (missingCodes.length) {
      throw new Error(`SERVICE_QUALIFICATION_REQUIRED:${missingCodes.join(",")}`);
    }
  }

  private subscriptionPlan(code: string): Record<string, unknown> | undefined {
    return this.db
      .prepare(
        `SELECT code, name, monthly_price_cents, staff_limit, elder_limit,
                storage_mb, description, features_json, sort_order
           FROM demo_subscription_plans WHERE code = ?`,
      )
      .get(code) as Record<string, unknown> | undefined;
  }

  private assignSubscription(
    tenantId: string,
    planCode: string,
    assignedAt: string,
    overwrite = true,
  ): void {
    const plan = this.subscriptionPlan(planCode);
    if (!plan) throw new Error("SUBSCRIPTION_PLAN_NOT_FOUND");
    const periodStart = assignedAt.slice(0, 10);
    const end = new Date(`${periodStart}T00:00:00.000Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    const periodEnd = end.toISOString().slice(0, 10);
    const conflictClause = overwrite
      ? `ON CONFLICT(tenant_id) DO UPDATE SET
           plan_code = excluded.plan_code,
           billing_cycle = excluded.billing_cycle,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           monthly_price_cents = excluded.monthly_price_cents,
           updated_at = excluded.updated_at`
      : "ON CONFLICT(tenant_id) DO NOTHING";
    this.db
      .prepare(
        `INSERT INTO demo_tenant_subscriptions
          (tenant_id, plan_code, billing_cycle, current_period_start,
           current_period_end, monthly_price_cents, updated_at)
         VALUES (?, ?, 'MONTHLY', ?, ?, ?, ?)
         ${conflictClause}`,
      )
      .run(
        tenantId,
        String(plan.code),
        periodStart,
        periodEnd,
        Number(plan.monthly_price_cents),
        assignedAt,
      );
  }

  private updateTenantProfile(id: string, input: Record<string, unknown>): void {
    const current = this.db.prepare("SELECT * FROM demo_tenants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!current) return;
    const value = (key: string, fallback: unknown) =>
      input[key] === undefined ? String(fallback || "") : String(input[key] || "").trim();
    const scopes = Array.isArray(input.serviceScopes)
      ? input.serviceScopes.map(String).map((item) => item.trim()).filter(Boolean)
      : JSON.parse(String(current.service_scopes_json || "[]"));
    this.db.prepare(
      `UPDATE demo_tenants SET
         archive_no = ?, institution_type = ?, unified_social_credit_code = ?,
         legal_representative = ?, contact_name = ?, contact_phone = ?,
         province = ?, city = ?, district = ?, address = ?, onboarding_stage = ?,
         service_scopes_json = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      value("archiveNo", current.archive_no || `ORG-${id.slice(-8).toUpperCase()}`),
      value("institutionType", current.institution_type || "养老服务机构"),
      value("unifiedSocialCreditCode", current.unified_social_credit_code),
      value("legalRepresentative", current.legal_representative),
      value("contactName", current.contact_name),
      value("contactPhone", current.contact_phone),
      value("province", current.province || "甘肃省"),
      value("city", current.city || "兰州市"),
      value("district", current.district),
      value("address", current.address),
      value("onboardingStage", current.onboarding_stage || "资料准备"),
      JSON.stringify(scopes),
      value("notes", current.notes),
      new Date().toISOString(),
      id,
    );
  }

  private audit(
    actorId: string,
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: string,
    reason: string | null,
  ): void {
    this.db.prepare(
      `INSERT INTO demo_audit_events
        (id, tenant_id, actor_id, action, resource_type, resource_id, outcome, reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(`audit-${randomUUID()}`, tenantId, actorId, action, resourceType, resourceId, outcome, reason, new Date().toISOString());
  }

  private mapTask(row: TaskRow): Record<string, unknown> {
    const stages = JSON.parse(row.stages_json) as Record<string, StageValue>;
    const storedTemplate = JSON.parse(row.template_snapshot_json || "{}") as Record<string, unknown>;
    const templateSnapshot = Array.isArray(storedTemplate.fields)
      ? storedTemplate
      : this.getPublishedForm(row.tenant_id);
    const storedIssues = JSON.parse(row.return_issues_json || "[]") as Array<Record<string, unknown>>;
    const returnIssues = storedIssues.length
      ? storedIssues
      : row.return_reason
        ? [{ stage: "AFTER", fieldLabel: "服务结果总结", reason: row.return_reason, resolved: false }]
        : [];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      elderName: row.elder_name,
      archiveNo: row.archive_no,
      scheduledAt: row.scheduled_at,
      serviceItems: JSON.parse(row.service_items_json),
      responsibleId: row.responsible_id,
      responsibleName: this.staffName(row.tenant_id, row.responsible_id),
      participantIds: JSON.parse(row.participant_ids_json),
      participantNames: (JSON.parse(row.participant_ids_json) as string[]).map((id) => this.staffName(row.tenant_id, id)),
      status: row.status,
      revision: row.revision_no,
      returnReason: row.return_reason,
      returnIssues,
      templateSnapshot,
      stages,
      answers: JSON.parse(row.answers_json || "{}"),
      customerFeedback: (this.getCustomerFeedback(row.tenant_id, row.id) as { feedback?: unknown } | null)?.feedback || null,
      history: this.db.prepare("SELECT revision_no, status, reason, created_at FROM demo_task_history WHERE tenant_id = ? AND task_id = ? ORDER BY created_at DESC").all(row.tenant_id, row.id).map((item) => {
        const value = item as Record<string, unknown>;
        return { revision: value.revision_no, status: value.status, reason: value.reason, createdAt: value.created_at };
      }),
      stageProgress: Object.keys(stages).length,
      updatedAt: row.updated_at,
      isDemo: true,
    };
  }

  private staffName(tenantId: string, staffId: string): string {
    const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demo_staff_directory'").get();
    if (!table) return staffId;
    const row = this.db.prepare("SELECT name FROM demo_staff_directory WHERE tenant_id=? AND id=?").get(tenantId, staffId) as { name: string } | undefined;
    return row?.name || staffId;
  }

  private mapTenant(row: Record<string, unknown>) {
    const capacityMb = Number(row.capacity_mb);
    const usedBytes = Number(row.used_bytes);
    const subscription = this.db
      .prepare(
        `SELECT s.plan_code, s.billing_cycle, s.current_period_start,
                s.current_period_end, s.monthly_price_cents,
                p.name AS plan_name
           FROM demo_tenant_subscriptions s
           JOIN demo_subscription_plans p ON p.code = s.plan_code
          WHERE s.tenant_id = ?`,
      )
      .get(String(row.id)) as Record<string, unknown> | undefined;
    return {
      id: String(row.id),
      name: String(row.name),
      status: String(row.status),
      validUntil: String(row.valid_until),
      capacityMb,
      usedBytes,
      usagePercent: capacityMb ? Math.round((usedBytes / (capacityMb * 1024 * 1024)) * 1000) / 10 : 0,
      staffCount: Number(row.staff_count),
      renewalStatus: String(row.renewal_status),
      archiveNo: String(row.archive_no || ""),
      institutionType: String(row.institution_type || "养老服务机构"),
      unifiedSocialCreditCode: String(row.unified_social_credit_code || ""),
      legalRepresentative: String(row.legal_representative || ""),
      contactName: String(row.contact_name || ""),
      contactPhone: String(row.contact_phone || ""),
      province: String(row.province || "甘肃省"),
      city: String(row.city || "兰州市"),
      district: String(row.district || ""),
      address: String(row.address || ""),
      onboardingStage: String(row.onboarding_stage || "资料准备"),
      serviceScopes: JSON.parse(String(row.service_scopes_json || "[]")) as string[],
      notes: String(row.notes || ""),
      subscription: subscription
        ? {
            planCode: String(subscription.plan_code),
            planName: String(subscription.plan_name),
            billingCycle: String(subscription.billing_cycle),
            monthlyPriceCents: Number(subscription.monthly_price_cents),
            currentPeriodStart: String(subscription.current_period_start),
            currentPeriodEnd: String(subscription.current_period_end),
          }
        : {
            planCode: "DEMO_FREE",
            planName: "免费演示版",
            billingCycle: "MONTHLY",
            monthlyPriceCents: 0,
            currentPeriodStart: String(row.created_at),
            currentPeriodEnd: String(row.valid_until),
          },
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      isSimulation: true,
    };
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS demo_tenants (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
        valid_until TEXT NOT NULL, capacity_mb INTEGER NOT NULL,
        used_bytes INTEGER NOT NULL DEFAULT 0, staff_count INTEGER NOT NULL DEFAULT 0,
        renewal_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        archive_no TEXT NOT NULL DEFAULT '', institution_type TEXT NOT NULL DEFAULT '养老服务机构',
        unified_social_credit_code TEXT NOT NULL DEFAULT '', legal_representative TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '',
        province TEXT NOT NULL DEFAULT '甘肃省', city TEXT NOT NULL DEFAULT '兰州市',
        district TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
        onboarding_stage TEXT NOT NULL DEFAULT '资料准备', service_scopes_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS demo_subscription_plans (
        code TEXT PRIMARY KEY, name TEXT NOT NULL,
        monthly_price_cents INTEGER NOT NULL,
        staff_limit INTEGER NOT NULL, elder_limit INTEGER NOT NULL,
        storage_mb INTEGER NOT NULL, description TEXT NOT NULL,
        features_json TEXT NOT NULL, sort_order INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_tenant_subscriptions (
        tenant_id TEXT PRIMARY KEY, plan_code TEXT NOT NULL,
        billing_cycle TEXT NOT NULL, current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL, monthly_price_cents INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_staff_tasks (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, elder_name TEXT NOT NULL,
        archive_no TEXT NOT NULL, scheduled_at TEXT NOT NULL,
        service_items_json TEXT NOT NULL, responsible_id TEXT NOT NULL,
        participant_ids_json TEXT NOT NULL, status TEXT NOT NULL,
        revision_no INTEGER NOT NULL DEFAULT 1, return_reason TEXT,
        return_issues_json TEXT NOT NULL DEFAULT '[]',
        template_snapshot_json TEXT NOT NULL DEFAULT '{}',
        stages_json TEXT NOT NULL DEFAULT '{}', answers_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_demo_tasks_tenant_status
        ON demo_staff_tasks(tenant_id, status, scheduled_at);
      CREATE TABLE IF NOT EXISTS demo_support_grants (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, reason TEXT NOT NULL,
        scope TEXT NOT NULL, allow_download INTEGER NOT NULL DEFAULT 0,
        starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
        issued_by TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_audit_events (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
        outcome TEXT NOT NULL, reason TEXT, occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_demo_audit_tenant_time
        ON demo_audit_events(tenant_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS demo_task_history (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        revision_no INTEGER NOT NULL, status TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        reason TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_task_customer_feedback (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, task_id TEXT NOT NULL,
        revision_no INTEGER NOT NULL, status TEXT NOT NULL, evaluator_type TEXT NOT NULL,
        relationship TEXT NOT NULL, satisfaction TEXT NOT NULL, tags_json TEXT NOT NULL,
        feedback_text TEXT NOT NULL, capture_mode TEXT NOT NULL, refusal_reason TEXT NOT NULL,
        media_ids_json TEXT NOT NULL, entered_by TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(tenant_id,task_id)
      );
    `);
    const taskColumns = this.db.prepare("PRAGMA table_info(demo_staff_tasks)").all() as Array<{ name: string }>;
    const tenantColumns = this.db.prepare("PRAGMA table_info(demo_tenants)").all() as Array<{ name: string }>;
    const tenantColumnDefinitions: Array<[string, string]> = [
      ["archive_no", "TEXT NOT NULL DEFAULT ''"],
      ["institution_type", "TEXT NOT NULL DEFAULT '养老服务机构'"],
      ["unified_social_credit_code", "TEXT NOT NULL DEFAULT ''"],
      ["legal_representative", "TEXT NOT NULL DEFAULT ''"],
      ["contact_name", "TEXT NOT NULL DEFAULT ''"],
      ["contact_phone", "TEXT NOT NULL DEFAULT ''"],
      ["province", "TEXT NOT NULL DEFAULT '甘肃省'"],
      ["city", "TEXT NOT NULL DEFAULT '兰州市'"],
      ["district", "TEXT NOT NULL DEFAULT ''"],
      ["address", "TEXT NOT NULL DEFAULT ''"],
      ["onboarding_stage", "TEXT NOT NULL DEFAULT '资料准备'"],
      ["service_scopes_json", "TEXT NOT NULL DEFAULT '[]'"],
      ["notes", "TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [name, definition] of tenantColumnDefinitions) {
      if (!tenantColumns.some((column) => column.name === name)) {
        this.db.exec(`ALTER TABLE demo_tenants ADD COLUMN ${name} ${definition};`);
      }
    }
    if (!taskColumns.some((column) => column.name === "answers_json")) {
      this.db.exec("ALTER TABLE demo_staff_tasks ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}';");
    }
    if (!taskColumns.some((column) => column.name === "return_issues_json")) {
      this.db.exec("ALTER TABLE demo_staff_tasks ADD COLUMN return_issues_json TEXT NOT NULL DEFAULT '[]';");
    }
    if (!taskColumns.some((column) => column.name === "template_snapshot_json")) {
      this.db.exec("ALTER TABLE demo_staff_tasks ADD COLUMN template_snapshot_json TEXT NOT NULL DEFAULT '{}';");
    }
  }

  private seed(): void {
    const now = "2026-08-09T09:00:00.000Z";
    const planInsert = this.db.prepare(
      `INSERT OR REPLACE INTO demo_subscription_plans
       (code, name, monthly_price_cents, staff_limit, elder_limit, storage_mb,
        description, features_json, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    planInsert.run("DEMO_FREE", "免费演示版", 0, 5, 30, 2048, "仅用于产品体验和示例数据，不承载真实业务资料。", JSON.stringify(["示例数据", "基础任务体验", "帮助中心"]), 10);
    planInsert.run("STARTER", "单店入门版", 12800, 10, 150, 20480, "适合小型单店建立基础档案和服务流程。", JSON.stringify(["老人档案", "服务任务", "动态表单", "基础导出"]), 20);
    planInsert.run("STANDARD", "单店标准版", 32800, 30, 800, 102400, "适合正式开展照护履约、合同和核销管理的单店机构。", JSON.stringify(["入门版全部功能", "合同与核销", "宣传素材", "食品追溯", "审计与支持授权"]), 30);
    planInsert.run("PROFESSIONAL", "机构专业版", 64800, 100, 3000, 512000, "适合人员较多、需要更高容量和运营管理能力的专业机构。", JSON.stringify(["标准版全部功能", "更高人员与容量额度", "高级归档导出", "优先支持"]), 40);
    const tenantInsert = this.db.prepare(
      `INSERT OR IGNORE INTO demo_tenants
       (id, name, status, valid_until, capacity_mb, used_bytes, staff_count, renewal_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    tenantInsert.run("tenant-lanzhou-pilot", "兰州试点机构", "ACTIVE", "2027-02-28", 102400, 734003200, 18, "TRIAL", now, now);
    tenantInsert.run("tenant-isolation-test", "天水协作机构", "READ_ONLY", "2026-10-31", 20480, 901775360, 7, "ACTIVE", now, now);
    tenantInsert.run("tenant-demo-free", "西固体验机构", "ACTIVE", "2026-09-08", 2048, 104857600, 3, "TRIAL", now, now);
    tenantInsert.run("tenant-demo-professional", "城关照护机构", "ACTIVE", "2027-08-31", 512000, 128849018880, 64, "ACTIVE", now, now);
    this.updateTenantProfile("tenant-lanzhou-pilot", { archiveNo: "ORG-LZ-2026-001", institutionType: "养老服务机构", contactName: "王经理", contactPhone: "13800001234", province: "甘肃省", city: "兰州市", district: "城关区", address: "演示路 1 号", onboardingStage: "试运行", serviceScopes: ["居家上门", "日托", "常住照护"] });
    this.updateTenantProfile("tenant-isolation-test", { archiveNo: "ORG-TS-2026-002", institutionType: "护理服务机构", contactName: "李主任", province: "甘肃省", city: "天水市", onboardingStage: "资质审核", serviceScopes: ["居家上门"] });
    this.updateTenantProfile("tenant-demo-free", { archiveNo: "ORG-XG-2026-003", institutionType: "社区服务机构", contactName: "赵老师", province: "甘肃省", city: "兰州市", onboardingStage: "资料准备", serviceScopes: ["探访关爱"] });
    this.updateTenantProfile("tenant-demo-professional", { archiveNo: "ORG-CG-2026-004", institutionType: "医养结合机构", contactName: "陈院长", province: "甘肃省", city: "兰州市", district: "城关区", onboardingStage: "正式运行", serviceScopes: ["常住照护", "康复护理", "居家上门"] });
    this.assignSubscription("tenant-lanzhou-pilot", "STANDARD", now, false);
    this.assignSubscription("tenant-isolation-test", "STARTER", now, false);
    this.assignSubscription("tenant-demo-free", "DEMO_FREE", now, false);
    this.assignSubscription("tenant-demo-professional", "PROFESSIONAL", now, false);
    this.db.exec(`UPDATE demo_tenant_subscriptions
      SET monthly_price_cents = (
        SELECT monthly_price_cents FROM demo_subscription_plans
        WHERE demo_subscription_plans.code = demo_tenant_subscriptions.plan_code
      );`);

    const taskInsert = this.db.prepare(
      `INSERT OR IGNORE INTO demo_staff_tasks
       (id, tenant_id, elder_name, archive_no, scheduled_at, service_items_json,
        responsible_id, participant_ids_json, status, revision_no, return_reason,
        template_snapshot_json, stages_json, answers_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const seededTemplate = JSON.stringify(
      this.getPublishedForm("tenant-lanzhou-pilot") || fallbackServiceForm,
    );
    taskInsert.run("task-lz-001", "tenant-lanzhou-pilot", "张奶奶", "LZ-2026-001", "2026-08-09T09:30:00.000+08:00", JSON.stringify(["助洁·居室清洁", "助行·陪同散步"]), "staff-lz-001", JSON.stringify(["staff-lz-002"]), "NOT_STARTED", 1, null, seededTemplate, "{}", "{}", now);
    taskInsert.run("task-lz-002", "tenant-lanzhou-pilot", "李爷爷", "LZ-2026-002", "2026-08-09T14:00:00.000+08:00", JSON.stringify(["健康管理·测量血压", "基础照护·用药提醒"]), "staff-lz-001", "[]", "IN_PROGRESS", 1, null, seededTemplate, JSON.stringify({ BEFORE: { note: "到达后确认精神状态平稳", recordedAt: now, locationStatus: "SIMULATED", evidence: [] } }), "{}", now);
    taskInsert.run("task-lz-003", "tenant-lanzhou-pilot", "王奶奶", "LZ-2026-003", "2026-08-08T10:00:00.000+08:00", JSON.stringify(["探访关爱·聊天陪伴"]), "staff-lz-001", "[]", "RETURNED", 2, "请补充服务完成情况。", seededTemplate, JSON.stringify({ BEFORE: { note: "到达服务地点并确认环境安全", recordedAt: now, locationStatus: "SIMULATED", evidence: [] }, DURING: { note: "完成聊天陪伴和情绪观察", recordedAt: now, locationStatus: "SIMULATED", evidence: [] }, AFTER: { note: "", recordedAt: now, locationStatus: "SIMULATED", evidence: [] } }), "{}", now);
    const completedStages = JSON.stringify({
      BEFORE: { note: "已到达并完成服务前确认", recordedAt: now, locationStatus: "SIMULATED", evidence: [] },
      DURING: { note: "按计划完成服务项目", recordedAt: now, locationStatus: "SIMULATED", evidence: [] },
      AFTER: { note: "服务完成并确认现场情况", recordedAt: now, locationStatus: "SIMULATED", evidence: [] },
    });
    taskInsert.run("task-lz-004", "tenant-lanzhou-pilot", "周奶奶", "LZ-2026-004", "2026-08-07T09:00:00.000+08:00", JSON.stringify(["生活照料·居室清洁"]), "staff-lz-001", JSON.stringify(["staff-lz-002"]), "APPROVED", 1, null, seededTemplate, completedStages, JSON.stringify({ "preset-result-default": "服务已完成。" }), now);
    taskInsert.run("task-lz-005", "tenant-lanzhou-pilot", "陈爷爷", "LZ-2026-005", "2026-08-08T15:00:00.000+08:00", JSON.stringify(["健康管理·测量血压"]), "staff-lz-002", JSON.stringify(["staff-lz-003"]), "APPROVED", 1, null, seededTemplate, completedStages, JSON.stringify({ "preset-result-default": "健康指标记录完成。" }), now);
    taskInsert.run("task-lz-006", "tenant-lanzhou-pilot", "赵奶奶", "LZ-2026-006", "2026-08-09T16:00:00.000+08:00", JSON.stringify(["探访关爱·定期探访"]), "staff-lz-003", "[]", "APPROVED", 1, null, seededTemplate, completedStages, JSON.stringify({ "preset-result-default": "探访服务已完成。" }), now);
    this.db.prepare(
      "UPDATE demo_staff_tasks SET return_issues_json = ? WHERE id = ? AND return_issues_json = '[]'",
    ).run(
      JSON.stringify([
        {
          stage: "AFTER",
          fieldId: "preset-result-default",
          fieldLabel: "服务结果总结",
          reason: "请补充本次服务完成情况。",
          resolved: false,
        },
      ]),
      "task-lz-003",
    );
    const publishedTemplate = this.getPublishedForm("tenant-lanzhou-pilot");
    if (publishedTemplate) {
      this.db.prepare(
        "UPDATE demo_staff_tasks SET template_snapshot_json = ? WHERE tenant_id = ? AND template_snapshot_json = '{}'",
      ).run(
        JSON.stringify(publishedTemplate),
        "tenant-lanzhou-pilot",
      );
    }
  }
}
