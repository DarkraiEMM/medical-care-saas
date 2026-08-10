import {
  createServiceRecordSchema,
  type CreateServiceRecordInput,
  type ServiceFormTemplate,
} from "@care/contracts";
import { hasPermission, type IdentityContext } from "@care/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ServiceConfigService } from "../service-config/service-config.service.js";
import { ServiceFormService } from "../service-form/service-form.service.js";
import {
  SERVICE_RECORD_REPOSITORY,
  type ServiceRecordEntry,
  type ServiceRecordRepository,
  type ServiceEvidenceEntry,
  type UploadServiceEvidenceInput,
} from "./service-record-repository.js";

@Injectable()
export class ServiceRecordsService {
  constructor(
    @Inject(SERVICE_RECORD_REPOSITORY)
    private readonly repository: ServiceRecordRepository,
    @Inject(ServiceConfigService)
    private readonly serviceConfigService: ServiceConfigService,
    @Inject(ServiceFormService)
    private readonly serviceFormService: ServiceFormService,
  ) {}

  async list(
    identity: IdentityContext,
    periodId: string,
  ): Promise<ServiceRecordEntry[]> {
    const tenantId = this.requirePermission(identity, "service:read");
    return this.repository.list(tenantId, periodId);
  }

  async create(
    identity: IdentityContext,
    periodId: string,
    input: unknown,
  ): Promise<{ record: ServiceRecordEntry; completedCount: number }> {
    const tenantId = this.requirePermission(identity, "service:write");
    const parsed = createServiceRecordSchema.safeParse({
      ...(typeof input === "object" && input !== null ? input : {}),
      periodId,
    });
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_SERVICE_RECORD",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    let templateSnapshot: ServiceFormTemplate | undefined;
    if (parsed.data.templateId && parsed.data.templateVersion) {
      templateSnapshot = await this.validateTemplateAnswers(
        identity,
        parsed.data,
      );
    } else {
      const workspaceConfig = await this.serviceConfigService.get(identity);
      const enabledItems = new Set(workspaceConfig.enabledServiceItemIds);
      const rules = workspaceConfig.rules;
      const missingConfiguredFields = [
        rules.beforeNoteRequired && !parsed.data.stageNotes.BEFORE
          ? "服务前记录"
          : "",
        rules.duringNoteRequired && !parsed.data.stageNotes.DURING
          ? "服务中记录"
          : "",
        rules.afterNoteRequired && !parsed.data.stageNotes.AFTER
          ? "服务后记录"
          : "",
        rules.resultSummaryRequired && !parsed.data.log ? "服务结果总结" : "",
      ].filter(Boolean);
      if (missingConfiguredFields.length > 0) {
        throw new BadRequestException({
          code: "MISSING_CONFIGURED_FIELDS",
          message: `当前门店要求填写：${missingConfiguredFields.join("、")}`,
        });
      }
      if (
        parsed.data.serviceItemVersionIds.some(
          (itemId) => !enabledItems.has(itemId),
        )
      ) {
        throw new BadRequestException({
          code: "SERVICE_ITEM_NOT_ENABLED",
          message: "所选服务项目中包含当前门店未启用的项目。",
        });
      }
    }
    const result = await this.repository.create(
      tenantId,
      parsed.data as CreateServiceRecordInput,
      templateSnapshot,
    );
    if (result.outcome === "PERIOD_NOT_FOUND") {
      throw new NotFoundException("当前机构中未找到该服务周期。");
    }
    if (result.outcome === "PERIOD_NOT_EDITABLE") {
      throw new ConflictException(
        "该周期为历史演示、已退回或待审核版本，不能继续新增记录。",
      );
    }
    if (result.outcome === "DATE_OUTSIDE_PERIOD") {
      throw new BadRequestException({
        code: "DATE_OUTSIDE_PERIOD",
        message: `服务日期必须属于 ${result.yearMonth} 核销周期。`,
      });
    }
    return { record: result.record, completedCount: result.completedCount };
  }

  async listEvidence(
    identity: IdentityContext,
    recordId: string,
  ): Promise<ServiceEvidenceEntry[]> {
    const tenantId = this.requirePermission(identity, "service:read");
    return this.repository.listEvidence(tenantId, recordId);
  }

  async uploadEvidence(
    identity: IdentityContext,
    recordId: string,
    input: unknown,
  ): Promise<ServiceEvidenceEntry> {
    const tenantId = this.requirePermission(identity, "service:write");
    if (typeof input !== "object" || input === null) {
      throw new BadRequestException("影像参数不完整。");
    }
    const value = input as Partial<UploadServiceEvidenceInput>;
    if (
      !value.stage ||
      !["BEFORE", "DURING", "AFTER"].includes(value.stage) ||
      !value.fileName ||
      !value.mimeType?.startsWith("image/") ||
      !Number.isInteger(value.sizeBytes) ||
      Number(value.sizeBytes) < 1 ||
      Number(value.sizeBytes) > 5 * 1024 * 1024 ||
      !value.dataUrl?.startsWith(`data:${value.mimeType};base64,`)
    ) {
      throw new BadRequestException(
        "当前验证版仅支持不超过5MB的图片，并需标记服务阶段。",
      );
    }
    const evidence = await this.repository.uploadEvidence(
      tenantId,
      recordId,
      value as UploadServiceEvidenceInput,
    );
    if (!evidence) throw new NotFoundException("未找到对应服务记录。");
    return evidence;
  }

  private requirePermission(
    identity: IdentityContext,
    permission: "service:read" | "service:write",
  ): string {
    if (
      !identity.tenantId ||
      !hasPermission(identity, permission, identity.tenantId)
    ) {
      throw new ForbiddenException("无权访问该机构的服务记录。");
    }
    return identity.tenantId;
  }

  private async validateTemplateAnswers(
    identity: IdentityContext,
    input: CreateServiceRecordInput,
  ): Promise<ServiceFormTemplate> {
    const workspace = await this.serviceFormService.get(identity);
    const template = workspace.publishedTemplate;
    if (
      input.templateId !== template.id ||
      input.templateVersion !== template.version
    ) {
      throw new ConflictException({
        code: "SERVICE_FORM_TEMPLATE_CHANGED",
        message: "服务表单版本已变化，请刷新后重新填写。",
      });
    }
    const answerMap = new Map(
      input.answers.map((answer) => [answer.fieldId, answer]),
    );
    const isEmpty = (value: unknown): boolean =>
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    const missing = template.fields
      .filter((field) => field.enabled && field.required)
      .filter((field) => isEmpty(answerMap.get(field.id)?.value))
      .map((field) => field.label);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: "MISSING_TEMPLATE_FIELDS",
        message: `请填写：${missing.join("、")}`,
      });
    }
    for (const answer of input.answers) {
      const field = template.fields.find((item) => item.id === answer.fieldId);
      if (!field || !field.enabled || field.type !== answer.fieldType) {
        throw new BadRequestException({
          code: "INVALID_TEMPLATE_ANSWER",
          message: "表单答案与当前模板字段不匹配。",
        });
      }
      const isChoiceField =
        field.type === "SINGLE_CHOICE" || field.type === "MULTI_CHOICE";
      const selectedOptionIds = Array.isArray(answer.value)
        ? answer.value
        : typeof answer.value === "string" && answer.value
          ? [answer.value]
          : [];
      if (
        isChoiceField &&
        selectedOptionIds.some(
          (optionId) =>
            !field.options.some(
              (option) => option.id === optionId && option.enabled,
            ),
        )
      ) {
        throw new BadRequestException({
          code: "INVALID_TEMPLATE_OPTION",
          message: `${field.label}中包含无效选项。`,
        });
      }
    }
    const unavailableQualifications = [
      ...new Set(
        template.fields
          .flatMap((field) => field.qualificationCodes)
          .filter(
            (code) =>
              workspace.qualifications.find((item) => item.code === code)
                ?.status !== "APPROVED",
          ),
      ),
    ];
    if (unavailableQualifications.length > 0) {
      throw new ConflictException({
        code: "QUALIFICATION_REQUIRED",
        qualificationCodes: unavailableQualifications,
        message: "当前服务包含资质已失效的受限字段。",
      });
    }
    return template;
  }
}
