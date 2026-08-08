import type { CreateServicePeriodInput } from "@care/contracts";

export const SERVICE_PERIOD_REPOSITORY = Symbol("SERVICE_PERIOD_REPOSITORY");

export interface ServicePeriodRecord {
  id: string;
  tenantId: string;
  elderId: string;
  yearMonth: string;
  serviceMode: CreateServicePeriodInput["serviceMode"];
  status: "DRAFT" | "IN_SERVICE" | "READY_FOR_REVIEW";
  minimumRecordCount: number;
  completedRecordCount: number;
  selfPaidCents: number;
  voucherCents: number;
  totalCents: number;
  createdAt: string;
}

export type CreateServicePeriodResult =
  | { outcome: "CREATED"; record: ServicePeriodRecord }
  | { outcome: "ELDER_NOT_FOUND" }
  | { outcome: "DUPLICATE" };

export interface ServicePeriodRepository {
  list(tenantId: string, elderId: string): Promise<ServicePeriodRecord[]>;
  create(
    tenantId: string,
    elderId: string,
    input: CreateServicePeriodInput,
  ): Promise<CreateServicePeriodResult>;
}
