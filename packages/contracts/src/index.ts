import { z } from "zod";

export const serviceStageSchema = z.enum(["BEFORE", "DURING", "AFTER"]);
export type ServiceStage = z.infer<typeof serviceStageSchema>;

export const returnIssueSchema = z.object({
  stage: serviceStageSchema,
  fieldId: z.string().min(1).optional(),
  fieldLabel: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  resolved: z.boolean().default(false),
});
export type ReturnIssue = z.infer<typeof returnIssueSchema>;

export const serviceRecordStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "APPROVED",
  "ARCHIVED",
]);
export type ServiceRecordStatus = z.infer<typeof serviceRecordStatusSchema>;

export const createElderSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  primaryContactName: z.string().trim().min(1).max(50),
  primaryContactPhone: z.string().regex(/^1[3-9]\d{9}$/),
  serviceMode: z.enum([
    "PERIODIC_HOME_VISIT",
    "APPOINTMENT_HOME_VISIT",
    "DAY_CARE",
    "RESIDENTIAL",
    "SHORT_TERM_LIVE_IN",
    "LONG_TERM_LIVE_IN",
  ]),
  allergies: z.array(z.string().trim().min(1).max(100)).default([]),
  medicalHistory: z.array(z.string().trim().min(1).max(100)).default([]),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(100)).default([]),
  careNotes: z.string().trim().max(2000).default(""),
});
export type CreateElderInput = z.infer<typeof createElderSchema>;

export const serviceModeSchema = z.enum([
  "PERIODIC_HOME_VISIT",
  "APPOINTMENT_HOME_VISIT",
  "DAY_CARE",
  "RESIDENTIAL",
  "SHORT_TERM_LIVE_IN",
  "LONG_TERM_LIVE_IN",
]);

export const createServicePeriodSchema = z
  .object({
    yearMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份必须使用 YYYY-MM 格式"),
    serviceMode: serviceModeSchema,
    minimumRecordCount: z.number().int().min(1).max(31).default(4),
    selfPaidCents: z.number().int().min(0),
    voucherCents: z.number().int().min(0),
    totalCents: z.number().int().min(0),
  })
  .refine(
    (input) => input.selfPaidCents + input.voucherCents === input.totalCents,
    {
      path: ["totalCents"],
      message: "自费金额与消费券金额之和必须等于合计金额",
    },
  );
export type CreateServicePeriodInput = z.infer<
  typeof createServicePeriodSchema
>;

export const vitalSignSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("BLOOD_PRESSURE"),
    systolic: z.number().int().positive(),
    diastolic: z.number().int().positive(),
    unit: z.literal("mmHg"),
    context: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("BLOOD_GLUCOSE"),
    value: z.number().positive(),
    unit: z.enum(["mmol/L", "mg/dL"]),
    context: z.enum(["FASTING", "BEFORE_MEAL", "AFTER_MEAL", "RANDOM"]),
  }),
  z.object({
    type: z.literal("HEART_RATE"),
    value: z.number().int().positive(),
    unit: z.literal("bpm"),
    context: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("TEMPERATURE"),
    value: z.number().positive(),
    unit: z.literal("°C"),
    context: z.string().trim().max(200).optional(),
  }),
]);
export type VitalSignInput = z.infer<typeof vitalSignSchema>;

export const serviceFormFieldTypeSchema = z.enum([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "DATE",
  "TIME",
  "IMAGE",
  "CUSTOMER_FEEDBACK",
]);
export type ServiceFormFieldType = z.infer<typeof serviceFormFieldTypeSchema>;

export const serviceFormAnswerSchema = z.object({
  fieldId: z.string().min(1),
  fieldType: serviceFormFieldTypeSchema,
  value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
});
export type ServiceFormAnswer = z.infer<typeof serviceFormAnswerSchema>;

export const createServiceRecordSchema = z
  .object({
    periodId: z.string().min(1),
    templateId: z.string().min(1).optional(),
    templateVersion: z.number().int().positive().optional(),
    occurredAt: z.iso.datetime({ offset: true }),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    responsibleId: z.string().min(1),
    participantIds: z.array(z.string().min(1)).min(1),
    serviceItemVersionIds: z.array(z.string().min(1)).default([]),
    log: z.string().trim().max(3000).default(""),
    stages: z
      .array(serviceStageSchema)
      .length(3)
      .refine((stages) => new Set(stages).size === 3, "前中后三阶段不能重复"),
    stageNotes: z.object({
      BEFORE: z.string().trim().max(1000).default(""),
      DURING: z.string().trim().max(1000).default(""),
      AFTER: z.string().trim().max(1000).default(""),
    }),
    vitalSigns: z.array(vitalSignSchema).default([]),
    answers: z.array(serviceFormAnswerSchema).default([]),
  })
  .refine((input) => new Date(input.endedAt) > new Date(input.startedAt), {
    path: ["endedAt"],
    message: "结束时间必须晚于开始时间",
  })
  .refine((input) => input.participantIds.includes(input.responsibleId), {
    path: ["responsibleId"],
    message: "负责人必须属于本次参与人员",
  });
export type CreateServiceRecordInput = z.infer<
  typeof createServiceRecordSchema
>;

export const serviceFormRulesSchema = z
  .object({
    beforeNoteRequired: z.boolean(),
    duringNoteRequired: z.boolean(),
    afterNoteRequired: z.boolean(),
    resultSummaryRequired: z.boolean(),
    evidenceEnabled: z.boolean(),
    evidenceRequired: z.boolean(),
  })
  .refine((rules) => rules.evidenceEnabled || !rules.evidenceRequired, {
    path: ["evidenceRequired"],
    message: "启用图片后才能将图片设置为必填",
  });
export type ServiceFormRules = z.infer<typeof serviceFormRulesSchema>;

export const updateServiceWorkspaceConfigSchema = z.object({
  rules: serviceFormRulesSchema,
  enabledServiceItemIds: z.array(z.string().min(1)),
  categories: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().trim().min(1).max(100),
        enabled: z.boolean().default(true),
        order: z.number().int().nonnegative(),
        items: z.array(
          z.object({
            id: z.string().min(1),
            label: z.string().trim().min(1).max(100),
            enabled: z.boolean().default(true),
            order: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .max(50)
    .optional(),
});
export type UpdateServiceWorkspaceConfigInput = z.infer<
  typeof updateServiceWorkspaceConfigSchema
>;

export const serviceFormOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  source: z.enum(["PRESET", "TENANT_CUSTOM"]),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
});
export type ServiceFormOption = z.infer<typeof serviceFormOptionSchema>;

export const serviceTemplateFieldSchema = z.object({
  id: z.string().min(1),
  presetCode: z.string().min(1).optional(),
  source: z.enum(["PRESET", "TENANT_CUSTOM"]),
  type: serviceFormFieldTypeSchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).default(""),
  required: z.boolean(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  unit: z.string().trim().max(30).optional(),
  options: z.array(serviceFormOptionSchema).default([]),
  qualificationCodes: z.array(z.string().min(1)).default([]),
  evidenceStage: serviceStageSchema.optional(),
  groupCode: z.string().trim().min(1).max(80).optional(),
  groupLabel: z.string().trim().min(1).max(100).optional(),
  feedbackConfig: z.object({
    satisfaction: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    tags: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    text: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    audio: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    signature: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    photo: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    refusalReason: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
    maxAudioSeconds: z.number().int().min(10).max(180).default(60),
    maxPhotos: z.number().int().min(1).max(6).default(3),
  }).optional(),
});
export type ServiceTemplateField = z.infer<typeof serviceTemplateFieldSchema>;

export const reviewServiceTaskSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE") }),
  z.object({
    action: z.literal("RETURN"),
    issues: z.array(returnIssueSchema).min(1).max(20),
  }),
]);
export type ReviewServiceTaskInput = z.infer<typeof reviewServiceTaskSchema>;

export const serviceFormTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  version: z.number().int().positive(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  fields: z.array(serviceTemplateFieldSchema).max(100),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ServiceFormTemplate = z.infer<typeof serviceFormTemplateSchema>;

export const qualificationStatusSchema = z.enum([
  "MISSING",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);
export type QualificationStatus = z.infer<typeof qualificationStatusSchema>;

export const organizationQualificationSchema = z.object({
  code: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  status: qualificationStatusSchema,
  validUntil: z.string().optional(),
  mockDocumentName: z.string().max(200).optional(),
  uploadStatus: z.enum(["NOT_UPLOADED", "UPLOADED"]).optional(),
  submittedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  rejectionReason: z.string().max(500).optional(),
  isSimulation: z.boolean(),
});
export type OrganizationQualification = z.infer<
  typeof organizationQualificationSchema
>;

export const saveServiceFormTemplateSchema = z.object({
  template: serviceFormTemplateSchema.extend({
    status: z.literal("DRAFT"),
  }),
});
export type SaveServiceFormTemplateInput = z.infer<
  typeof saveServiceFormTemplateSchema
>;

export const simulateQualificationSchema = z.object({
  status: qualificationStatusSchema,
});
export type SimulateQualificationInput = z.infer<
  typeof simulateQualificationSchema
>;

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}
