import type {
  CreateServiceRecordInput,
  ServiceFormTemplate,
} from "@care/contracts";

export const SERVICE_RECORD_REPOSITORY = Symbol("SERVICE_RECORD_REPOSITORY");

export interface ServiceRecordEntry {
  id: string;
  tenantId: string;
  periodId: string;
  templateId: string | undefined;
  templateVersion: number | undefined;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "ARCHIVED";
  occurredAt: string;
  startedAt: string;
  endedAt: string;
  responsibleId: string;
  participantIds: string[];
  serviceItemVersionIds: string[];
  log: string;
  stageNotes: CreateServiceRecordInput["stageNotes"];
  answers: CreateServiceRecordInput["answers"];
  templateSnapshot: ServiceFormTemplate | undefined;
  createdAt: string;
}

export interface ServiceEvidenceEntry {
  id: string;
  recordId: string;
  stage: "BEFORE" | "DURING" | "AFTER";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: string;
}

export interface UploadServiceEvidenceInput {
  stage: ServiceEvidenceEntry["stage"];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
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
    templateSnapshot?: ServiceFormTemplate,
  ): Promise<CreateServiceRecordResult>;
  listEvidence(
    tenantId: string,
    recordId: string,
  ): Promise<ServiceEvidenceEntry[]>;
  uploadEvidence(
    tenantId: string,
    recordId: string,
    input: UploadServiceEvidenceInput,
  ): Promise<ServiceEvidenceEntry | null>;
}
