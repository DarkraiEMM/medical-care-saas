import type {
  OrganizationQualification,
  QualificationStatus,
  ServiceFormOption,
  ServiceFormTemplate,
  ServiceTemplateField,
} from "@care/contracts";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ComponentPaletteItem,
  PublishTemplateResult,
  ServiceFormRepository,
  ServiceFormWorkspace,
} from "./service-form-repository.js";

const option = (
  id: string,
  label: string,
  order: number,
): ServiceFormOption => ({ id, label, order, source: "PRESET", enabled: true });

const lifeCareOptions = [
  "助洁 · 居室清洁",
  "助洁 · 衣物洗涤",
  "助洁 · 厨房/卫生间保洁",
  "助洁 · 物品整理",
  "助餐 · 上门做饭",
  "助餐 · 送餐",
  "助餐 · 协助喂食",
  "助餐 · 代购食材",
  "助浴 · 协助洗浴",
  "助浴 · 擦浴",
  "助浴 · 足部护理",
  "助浴 · 浴具清洁",
  "助行 · 陪同散步",
  "助行 · 陪同购物",
  "助行 · 陪同就医",
  "助行 · 代办事务",
  "助急 · 紧急呼叫响应",
  "助急 · 协助联系家属/医疗机构",
  "助急 · 应急简单处置",
  "助医 · 协助取药",
  "助医 · 陪同就诊",
  "助医 · 协助记录医嘱",
  "助医 · 用药提醒",
].map((label, index) => option(`life-${index + 1}`, label, index));

const multiField = (
  id: string,
  presetCode: string,
  label: string,
  labels: string[],
  qualificationCodes: string[] = [],
): ServiceTemplateField => ({
  id,
  presetCode,
  source: "PRESET",
  type: "MULTI_CHOICE",
  label,
  description: "",
  required: false,
  enabled: true,
  order: 0,
  qualificationCodes,
  options: labels.map((item, index) =>
    option(`${id}-option-${index + 1}`, item, index),
  ),
});

const textField = (
  id: string,
  presetCode: string,
  label: string,
  evidenceStage?: "BEFORE" | "DURING" | "AFTER",
): ServiceTemplateField => ({
  id,
  presetCode,
  source: "PRESET",
  type: "LONG_TEXT",
  label,
  description: "",
  required: false,
  enabled: true,
  order: 0,
  qualificationCodes: [],
  options: [],
  evidenceStage,
});

const imageField = (
  id: string,
  presetCode: string,
  label: string,
  evidenceStage: "BEFORE" | "DURING" | "AFTER",
): ServiceTemplateField => ({
  id,
  presetCode,
  source: "PRESET",
  type: "IMAGE",
  label,
  description: "",
  required: false,
  enabled: true,
  order: 0,
  qualificationCodes: [],
  options: [],
  evidenceStage,
});

const customerFeedbackField: ServiceTemplateField = {
  id: "preset-customer-feedback",
  presetCode: "CUSTOMER_FEEDBACK",
  source: "PRESET",
  type: "CUSTOMER_FEEDBACK",
  label: "客户反馈",
  description: "服务结束后按门店要求采集评价或确认材料",
  required: false,
  enabled: true,
  order: 0,
  qualificationCodes: [],
  options: [
    option("feedback-tag-attitude", "服务态度", 0),
    option("feedback-tag-quality", "服务质量", 1),
    option("feedback-tag-punctual", "准时到达", 2),
    option("feedback-tag-communication", "沟通情况", 3),
  ],
  evidenceStage: "AFTER",
  feedbackConfig: {
    satisfaction: "OPTIONAL",
    tags: "OPTIONAL",
    text: "OPTIONAL",
    audio: "OPTIONAL",
    signature: "OPTIONAL",
    photo: "OPTIONAL",
    refusalReason: "OPTIONAL",
    maxAudioSeconds: 60,
    maxPhotos: 3,
  },
};

const presetFields: ServiceTemplateField[] = [
  textField(
    "preset-before-note",
    "SERVICE_BEFORE_NOTE",
    "服务前记录",
    "BEFORE",
  ),
  textField(
    "preset-during-note",
    "SERVICE_DURING_NOTE",
    "服务中记录",
    "DURING",
  ),
  textField("preset-after-note", "SERVICE_AFTER_NOTE", "服务后记录", "AFTER"),
  textField("preset-result", "SERVICE_RESULT", "服务结果总结", "AFTER"),
  {
    ...multiField("preset-life-care", "LIFE_CARE", "生活照料", []),
    options: lifeCareOptions,
  },
  ...(
    [
      ["SYSTOLIC_PRESSURE", "收缩压", "mmHg"],
      ["DIASTOLIC_PRESSURE", "舒张压", "mmHg"],
      ["BLOOD_GLUCOSE", "血糖", "mmol/L"],
      ["HEART_RATE", "心率", "bpm"],
      ["TEMPERATURE", "体温", "°C"],
    ] as Array<[string, string, string]>
  ).map(([presetCode, label, unit], index) => ({
    id: `preset-vital-${index + 1}`,
    presetCode,
    source: "PRESET" as const,
    type: "NUMBER" as const,
    label,
    description: "",
    required: false,
    enabled: true,
    order: 0,
    unit,
    groupCode: "VITAL_SIGNS",
    groupLabel: "健康指标",
    evidenceStage: "DURING" as const,
    qualificationCodes: [],
    options: [],
  })),
  multiField(
    "preset-health-service",
    "HEALTH_SERVICE",
    "健康服务",
    ["推拿", "艾灸", "刮痧", "拔罐"],
    ["HEALTH_SERVICE_OPERATION"],
  ),
  multiField(
    "preset-rehabilitation",
    "REHABILITATION_TRAINING",
    "康复训练",
    ["肢体训练", "吞咽功能训练", "言语训练", "认知能力训练"],
    ["REHABILITATION_SERVICE"],
  ),
  multiField(
    "preset-nursing",
    "NURSING_ASSISTANCE",
    "护理协助",
    ["协助翻身、体位变换", "压疮预防护理", "特殊皮肤护理", "药物喂服"],
    ["PROFESSIONAL_NURSING"],
  ),
  multiField(
    "preset-elimination",
    "ELIMINATION_CARE",
    "排泄护理",
    ["排尿护理", "排便护理", "排气护理"],
    ["PROFESSIONAL_NURSING"],
  ),
  multiField("preset-visit-care", "VISIT_CARE", "探访关爱", [
    "定期上门探访",
    "精神慰藉与聊天陪伴",
    "情绪疏导",
    "节日关怀",
    "其他",
  ]),
  imageField("preset-image-before", "IMAGE_BEFORE", "服务前图片", "BEFORE"),
  imageField("preset-image-during", "IMAGE_DURING", "服务中图片", "DURING"),
  imageField("preset-image-after", "IMAGE_AFTER", "服务后图片", "AFTER"),
  customerFeedbackField,
];

const componentTypes: ComponentPaletteItem[] = [
  { type: "SHORT_TEXT", label: "单行文字", description: "姓名、简短说明等" },
  { type: "LONG_TEXT", label: "多行文字", description: "过程、结果和补充说明" },
  { type: "NUMBER", label: "数字", description: "数量、测量值和可选单位" },
  { type: "SINGLE_CHOICE", label: "单选", description: "只能选择一个答案" },
  { type: "MULTI_CHOICE", label: "多选", description: "可自定义多个选项" },
  { type: "DATE", label: "日期", description: "补充业务日期" },
  { type: "TIME", label: "时间", description: "补充业务时间" },
  { type: "IMAGE", label: "图片", description: "上传现场或材料图片" },
];

const qualifications: OrganizationQualification[] = [
  {
    code: "HEALTH_SERVICE_OPERATION",
    name: "健康服务相关资质",
    status: "APPROVED",
    validUntil: "2030-12-31",
    mockDocumentName: "健康服务资质演示件.pdf",
    isSimulation: true,
  },
  {
    code: "REHABILITATION_SERVICE",
    name: "康复服务相关资质",
    status: "APPROVED",
    validUntil: "2030-12-31",
    mockDocumentName: "康复服务资质演示件.pdf",
    isSimulation: true,
  },
  {
    code: "PROFESSIONAL_NURSING",
    name: "专业护理相关资质",
    status: "APPROVED",
    validUntil: "2030-12-31",
    mockDocumentName: "专业护理资质演示件.pdf",
    isSimulation: true,
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function defaultTemplate(status: "DRAFT" | "PUBLISHED"): ServiceFormTemplate {
  const selectedCodes = [
    "SERVICE_RESULT",
    "IMAGE_BEFORE",
    "IMAGE_DURING",
    "IMAGE_AFTER",
    "CUSTOMER_FEEDBACK",
  ];
  return {
    id: "template-test-store-service",
    name: "门店服务记录表",
    version: 1,
    status,
    updatedAt: new Date().toISOString(),
    fields: presetFields
      .filter((field) => selectedCodes.includes(field.presetCode ?? ""))
      .map((field, order) => ({
        ...clone(field),
        id: `${field.id}-default`,
        required: field.presetCode === "SERVICE_RESULT",
        order,
      })),
  };
}

interface WorkspaceRow {
  draft_json: string;
  published_json: string;
  qualifications_json: string;
}

export class LocalSqliteServiceFormRepository implements ServiceFormRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath = process.env.LOCAL_SQLITE_PATH?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LOCAL_SQLITE_FORBIDDEN_IN_PRODUCTION");
    }
    const resolvedPath = resolve(databasePath || ".local-data/care-dev.sqlite");
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS local_service_form_workspace (
        tenant_id TEXT PRIMARY KEY,
        draft_json TEXT NOT NULL,
        published_json TEXT NOT NULL,
        qualifications_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_audit_events (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
        outcome TEXT NOT NULL, reason TEXT, occurred_at TEXT NOT NULL
      );
    `);
  }

  async get(tenantId: string): Promise<ServiceFormWorkspace> {
    this.ensureTenant(tenantId);
    const row = this.readRow(tenantId);
    return this.toWorkspace(row);
  }

  async saveDraft(
    tenantId: string,
    template: ServiceFormTemplate,
  ): Promise<ServiceFormWorkspace> {
    this.ensureTenant(tenantId);
    this.database
      .prepare(
        `UPDATE local_service_form_workspace
            SET draft_json = ?, updated_at = ?
          WHERE tenant_id = ?`,
      )
      .run(JSON.stringify(template), new Date().toISOString(), tenantId);
    return this.get(tenantId);
  }

  async publish(tenantId: string): Promise<PublishTemplateResult> {
    this.ensureTenant(tenantId);
    const row = this.readRow(tenantId);
    const draft = JSON.parse(row.draft_json) as ServiceFormTemplate;
    const currentPublished = JSON.parse(
      row.published_json,
    ) as ServiceFormTemplate;
    const currentQualifications = JSON.parse(
      row.qualifications_json,
    ) as OrganizationQualification[];
    const missingCodes = [
      ...new Set(
        draft.fields
          .flatMap((field) => field.qualificationCodes)
          .filter(
            (code) =>
              currentQualifications.find((item) => item.code === code)
                ?.status !== "APPROVED",
          ),
      ),
    ];
    if (missingCodes.length > 0) {
      return {
        outcome: "QUALIFICATION_REQUIRED",
        qualificationCodes: missingCodes,
      };
    }
    const published: ServiceFormTemplate = {
      ...clone(draft),
      status: "PUBLISHED",
      version: currentPublished.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const nextDraft: ServiceFormTemplate = {
      ...clone(published),
      status: "DRAFT",
    };
    this.database
      .prepare(
        `UPDATE local_service_form_workspace
            SET draft_json = ?, published_json = ?, updated_at = ?
          WHERE tenant_id = ?`,
      )
      .run(
        JSON.stringify(nextDraft),
        JSON.stringify(published),
        new Date().toISOString(),
        tenantId,
      );
    return { outcome: "PUBLISHED", workspace: await this.get(tenantId) };
  }

  async simulateQualification(
    tenantId: string,
    code: string,
    status: QualificationStatus,
  ): Promise<ServiceFormWorkspace | null> {
    this.ensureTenant(tenantId);
    const row = this.readRow(tenantId);
    const items = JSON.parse(
      row.qualifications_json,
    ) as OrganizationQualification[];
    const target = items.find((item) => item.code === code);
    if (!target) return null;
    target.status = status;
    this.database
      .prepare(
        `UPDATE local_service_form_workspace
            SET qualifications_json = ?, updated_at = ?
          WHERE tenant_id = ?`,
      )
      .run(JSON.stringify(items), new Date().toISOString(), tenantId);
    return this.get(tenantId);
  }

  async uploadQualification(
    tenantId: string,
    code: string,
    fileName: string,
    actorId = "tenant-admin",
  ): Promise<ServiceFormWorkspace | null> {
    this.ensureTenant(tenantId);
    const row = this.readRow(tenantId);
    const items = this.normalizedQualifications(row.qualifications_json);
    const target = items.find((item) => item.code === code);
    if (!target) return null;
    target.mockDocumentName = fileName.slice(0, 200);
    target.uploadStatus = "UPLOADED";
    target.status = "MISSING";
    delete target.submittedAt;
    delete target.reviewedAt;
    delete target.reviewedBy;
    delete target.rejectionReason;
    this.writeQualifications(tenantId, items);
    this.auditQualification(actorId, tenantId, "QUALIFICATION_UPLOAD", code, fileName);
    return this.get(tenantId);
  }

  async submitQualification(
    tenantId: string,
    code: string,
    actorId = "tenant-admin",
  ): Promise<ServiceFormWorkspace | null> {
    this.ensureTenant(tenantId);
    const row = this.readRow(tenantId);
    const items = this.normalizedQualifications(row.qualifications_json);
    const target = items.find((item) => item.code === code);
    if (!target) return null;
    if (!target.mockDocumentName) throw new Error("QUALIFICATION_FILE_REQUIRED");
    target.uploadStatus = "UPLOADED";
    target.status = "PENDING";
    target.submittedAt = new Date().toISOString();
    delete target.reviewedAt;
    delete target.reviewedBy;
    delete target.rejectionReason;
    this.writeQualifications(tenantId, items);
    this.auditQualification(actorId, tenantId, "QUALIFICATION_SUBMIT", code, null);
    return this.get(tenantId);
  }

  close(): void {
    this.database.close();
  }

  private ensureTenant(tenantId: string): void {
    const row = this.database
      .prepare(
        "SELECT tenant_id FROM local_service_form_workspace WHERE tenant_id = ?",
      )
      .get(tenantId);
    if (row) return;
    this.database
      .prepare(
        `INSERT INTO local_service_form_workspace (
           tenant_id, draft_json, published_json, qualifications_json, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        JSON.stringify(defaultTemplate("DRAFT")),
        JSON.stringify(defaultTemplate("PUBLISHED")),
        JSON.stringify(qualifications),
        new Date().toISOString(),
      );
  }

  private readRow(tenantId: string): WorkspaceRow {
    return this.database
      .prepare(
        `SELECT draft_json, published_json, qualifications_json
           FROM local_service_form_workspace WHERE tenant_id = ?`,
      )
      .get(tenantId) as unknown as WorkspaceRow;
  }

  private toWorkspace(row: WorkspaceRow): ServiceFormWorkspace {
    return {
      storeLabel: "兰州试点机构",
      isSimulation: true,
      presetFields: clone(presetFields),
      componentTypes: clone(componentTypes),
      draftTemplate: JSON.parse(row.draft_json) as ServiceFormTemplate,
      publishedTemplate: JSON.parse(row.published_json) as ServiceFormTemplate,
      qualifications: this.normalizedQualifications(row.qualifications_json),
    };
  }

  private normalizedQualifications(value: string): OrganizationQualification[] {
    return (JSON.parse(value) as OrganizationQualification[]).map((item) => ({
      ...item,
      uploadStatus: item.mockDocumentName ? "UPLOADED" : "NOT_UPLOADED",
    }));
  }

  private writeQualifications(
    tenantId: string,
    items: OrganizationQualification[],
  ): void {
    this.database
      .prepare(
        `UPDATE local_service_form_workspace
            SET qualifications_json = ?, updated_at = ?
          WHERE tenant_id = ?`,
      )
      .run(JSON.stringify(items), new Date().toISOString(), tenantId);
  }

  private auditQualification(
    actorId: string,
    tenantId: string,
    action: string,
    code: string,
    reason: string | null,
  ): void {
    this.database.prepare(
      `INSERT INTO demo_audit_events
        (id, tenant_id, actor_id, action, resource_type, resource_id, outcome, reason, occurred_at)
       VALUES (?, ?, ?, ?, 'organization_qualification', ?, 'SUCCESS', ?, ?)`,
    ).run(
      `audit-qualification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      actorId,
      action,
      code,
      reason,
      new Date().toISOString(),
    );
  }
}
