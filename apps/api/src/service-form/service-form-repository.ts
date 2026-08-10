import type {
  OrganizationQualification,
  QualificationStatus,
  ServiceFormFieldType,
  ServiceFormTemplate,
  ServiceTemplateField,
} from "@care/contracts";

export const SERVICE_FORM_REPOSITORY = Symbol("SERVICE_FORM_REPOSITORY");

export interface ComponentPaletteItem {
  type: ServiceFormFieldType;
  label: string;
  description: string;
}

export interface ServiceFormWorkspace {
  storeLabel: string;
  isSimulation: boolean;
  presetFields: ServiceTemplateField[];
  componentTypes: ComponentPaletteItem[];
  draftTemplate: ServiceFormTemplate;
  publishedTemplate: ServiceFormTemplate;
  qualifications: OrganizationQualification[];
}

export type PublishTemplateResult =
  | { outcome: "PUBLISHED"; workspace: ServiceFormWorkspace }
  | { outcome: "QUALIFICATION_REQUIRED"; qualificationCodes: string[] };

export interface ServiceFormRepository {
  get(tenantId: string): Promise<ServiceFormWorkspace>;
  saveDraft(
    tenantId: string,
    template: ServiceFormTemplate,
  ): Promise<ServiceFormWorkspace>;
  publish(tenantId: string): Promise<PublishTemplateResult>;
  simulateQualification(
    tenantId: string,
    code: string,
    status: QualificationStatus,
  ): Promise<ServiceFormWorkspace | null>;
  uploadQualification(
    tenantId: string,
    code: string,
    fileName: string,
    actorId?: string,
  ): Promise<ServiceFormWorkspace | null>;
  submitQualification(
    tenantId: string,
    code: string,
    actorId?: string,
  ): Promise<ServiceFormWorkspace | null>;
}
