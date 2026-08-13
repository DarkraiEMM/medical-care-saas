export type ServiceFormFieldType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "DATE"
  | "TIME"
  | "IMAGE"
  | "CUSTOMER_FEEDBACK";

export type QualificationStatus =
  "MISSING" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ServiceFormOption {
  id: string;
  label: string;
  source: "PRESET" | "TENANT_CUSTOM";
  enabled: boolean;
  order: number;
}

export interface ServiceTemplateField {
  id: string;
  presetCode?: string;
  source: "PRESET" | "TENANT_CUSTOM";
  type: ServiceFormFieldType;
  label: string;
  description: string;
  required: boolean;
  enabled: boolean;
  order: number;
  unit?: string;
  options: ServiceFormOption[];
  qualificationCodes: string[];
  evidenceStage?: "BEFORE" | "DURING" | "AFTER";
  groupCode?: string;
  groupLabel?: string;
  feedbackConfig?: CustomerFeedbackConfig;
}

export type FeedbackRequirement = "DISABLED" | "OPTIONAL" | "REQUIRED";

export interface CustomerFeedbackConfig {
  satisfaction: FeedbackRequirement;
  tags: FeedbackRequirement;
  text: FeedbackRequirement;
  audio: FeedbackRequirement;
  signature: FeedbackRequirement;
  photo: FeedbackRequirement;
  refusalReason: FeedbackRequirement;
  maxAudioSeconds: number;
  maxPhotos: number;
}

export interface ServiceFormTemplate {
  id: string;
  name: string;
  version: number;
  status: "DRAFT" | "PUBLISHED";
  fields: ServiceTemplateField[];
  updatedAt: string;
}

export interface OrganizationQualification {
  code: string;
  name: string;
  status: QualificationStatus;
  validUntil?: string;
  mockDocumentName?: string;
  uploadStatus?: "NOT_UPLOADED" | "UPLOADED";
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  isSimulation: boolean;
}

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

export interface ServiceFormAnswer {
  fieldId: string;
  fieldType: ServiceFormFieldType;
  value: string | number | string[] | null;
}
