import type { CreateServiceRecordInput } from "@care/contracts";

export const SERVICE_RECORD_REPOSITORY = Symbol("SERVICE_RECORD_REPOSITORY");

export interface ServiceRecordEntry {
  id: string;
  tenantId: string;
  periodId: string;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "ARCHIVED";
  occurredAt: string;
  startedAt: string;
  endedAt: string;
  participantIds: string[];
  serviceItemVersionIds: string[];
  log: string;
  stageNotes: CreateServiceRecordInput["stageNotes"];
  createdAt: string;
}

export type CreateServiceRecordResult =
  | { outcome: "CREATED"; record: ServiceRecordEntry; completedCount: number }
  | { outcome: "PERIOD_NOT_FOUND" }
  | { outcome: "PERIOD_NOT_EDITABLE" }
  | { outcome: "DATE_OUTSIDE_PERIOD"; yearMonth: string };

export interface ServiceRecordRepository {
  list(tenantId: string, periodId: string): Promise<ServiceRecordEntry[]>;
  create(
    tenantId: string,
    input: CreateServiceRecordInput,
  ): Promise<CreateServiceRecordResult>;
}
