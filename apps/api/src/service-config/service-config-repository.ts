import type {
  ServiceFormRules,
  UpdateServiceWorkspaceConfigInput,
} from "@care/contracts";

export const SERVICE_CONFIG_REPOSITORY = Symbol("SERVICE_CONFIG_REPOSITORY");

export interface ServiceItemOption {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
}

export interface ServiceItemCategory {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  items: ServiceItemOption[];
}

export interface StaffOption {
  id: string;
  displayName: string;
  department: string;
}

export interface ServiceWorkspaceConfig {
  rules: ServiceFormRules;
  enabledServiceItemIds: string[];
  categories: ServiceItemCategory[];
  staff: StaffOption[];
}

export interface ServiceConfigRepository {
  get(tenantId: string): Promise<ServiceWorkspaceConfig>;
  update(
    tenantId: string,
    input: UpdateServiceWorkspaceConfigInput,
  ): Promise<ServiceWorkspaceConfig>;
}
