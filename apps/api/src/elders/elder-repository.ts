import type { CreateElderInput } from "@care/contracts";

export const ELDER_REPOSITORY = Symbol("ELDER_REPOSITORY");

export interface ElderArchiveRecord {
  id: string;
  tenantId: string;
  archiveNo: string;
  displayName: string;
  primaryContactName: string;
  primaryContactPhoneMasked: string;
  serviceMode: CreateElderInput["serviceMode"];
  completedRecords: number;
  minimumRecords: number;
  status: "PENDING_PERIOD" | "IN_SERVICE" | "READY_FOR_REVIEW" | "RETURNED";
  createdAt: string;
}

export interface ElderRepository {
  list(tenantId: string): Promise<ElderArchiveRecord[]>;
  create(
    tenantId: string,
    input: CreateElderInput,
  ): Promise<ElderArchiveRecord>;
}
