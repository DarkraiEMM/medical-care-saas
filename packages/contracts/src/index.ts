import { z } from "zod";

export const serviceStageSchema = z.enum(["BEFORE", "DURING", "AFTER"]);
export type ServiceStage = z.infer<typeof serviceStageSchema>;

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

export const createServiceRecordSchema = z.object({
  periodId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  participantIds: z.array(z.string().min(1)).min(1),
  serviceItemVersionIds: z.array(z.string().min(1)).min(1),
  log: z.string().trim().min(10).max(3000),
  stages: z.array(serviceStageSchema),
  vitalSigns: z.array(vitalSignSchema).default([]),
});
export type CreateServiceRecordInput = z.infer<
  typeof createServiceRecordSchema
>;

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}
