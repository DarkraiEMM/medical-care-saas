import {
  saveServiceFormTemplateSchema,
  simulateQualificationSchema,
  type QualificationStatus,
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
import {
  SERVICE_FORM_REPOSITORY,
  type ServiceFormRepository,
  type ServiceFormWorkspace,
} from "./service-form-repository.js";

@Injectable()
export class ServiceFormService {
  constructor(
    @Inject(SERVICE_FORM_REPOSITORY)
    private readonly repository: ServiceFormRepository,
  ) {}

  async get(identity: IdentityContext): Promise<ServiceFormWorkspace> {
    return this.repository.get(
      this.requirePermission(identity, "service:read"),
    );
  }

  async saveDraft(
    identity: IdentityContext,
    input: unknown,
  ): Promise<ServiceFormWorkspace> {
    const tenantId = this.requirePermission(identity, "service:write");
    const parsed = saveServiceFormTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_SERVICE_FORM_TEMPLATE",
        issues: parsed.error.issues,
      });
    }
    return this.repository.saveDraft(tenantId, parsed.data.template);
  }

  async publish(identity: IdentityContext): Promise<ServiceFormWorkspace> {
    const tenantId = this.requirePermission(identity, "service:write");
    const result = await this.repository.publish(tenantId);
    if (result.outcome === "QUALIFICATION_REQUIRED") {
      throw new ConflictException({
        code: "QUALIFICATION_REQUIRED",
        qualificationCodes: result.qualificationCodes,
        message: "当前模板包含资质未满足的受限字段，暂时不能发布。",
      });
    }
    return result.workspace;
  }

  async simulateQualification(
    identity: IdentityContext,
    code: string,
    input: unknown,
  ): Promise<ServiceFormWorkspace> {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("生产环境禁止使用演示资质流程。");
    }
    const tenantId = this.requirePermission(identity, "service:write");
    const parsed = simulateQualificationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("资质状态无效。");
    const workspace = await this.repository.simulateQualification(
      tenantId,
      code,
      parsed.data.status as QualificationStatus,
    );
    if (!workspace) throw new NotFoundException("未找到对应的资质记录。");
    return workspace;
  }

  async uploadQualification(
    identity: IdentityContext,
    code: string,
    input: unknown,
  ): Promise<ServiceFormWorkspace> {
    const tenantId = this.requirePermission(identity, "service:write");
    const value = (input || {}) as Record<string, unknown>;
    const fileName = String(value.fileName || "").trim();
    if (!fileName || fileName.length > 200) {
      throw new BadRequestException("请选择用于演示验证的资质文件。");
    }
    const workspace = await this.repository.uploadQualification(
      tenantId,
      code,
      fileName,
      identity.actorId,
    );
    if (!workspace) throw new NotFoundException("未找到对应资质项目。");
    return workspace;
  }

  async submitQualification(
    identity: IdentityContext,
    code: string,
  ): Promise<ServiceFormWorkspace> {
    const tenantId = this.requirePermission(identity, "service:write");
    try {
      const workspace = await this.repository.submitQualification(tenantId, code, identity.actorId);
      if (!workspace) throw new NotFoundException("未找到对应资质项目。");
      return workspace;
    } catch (error) {
      if (error instanceof Error && error.message === "QUALIFICATION_FILE_REQUIRED") {
        throw new BadRequestException("请先上传资质材料，再提交平台审核。");
      }
      throw error;
    }
  }

  private requirePermission(
    identity: IdentityContext,
    permission: "service:read" | "service:write",
  ): string {
    if (
      !identity.tenantId ||
      !hasPermission(identity, permission, identity.tenantId)
    ) {
      throw new ForbiddenException("无权访问该机构的服务表单配置。");
    }
    return identity.tenantId;
  }
}
