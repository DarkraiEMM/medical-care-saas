import {
  createServicePeriodSchema,
  type CreateServicePeriodInput,
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
  SERVICE_PERIOD_REPOSITORY,
  type ServicePeriodRecord,
  type ServicePeriodRepository,
} from "./service-period-repository.js";

@Injectable()
export class ServicePeriodsService {
  constructor(
    @Inject(SERVICE_PERIOD_REPOSITORY)
    private readonly repository: ServicePeriodRepository,
  ) {}

  async list(
    identity: IdentityContext,
    elderId: string,
  ): Promise<ServicePeriodRecord[]> {
    const tenantId = this.requirePermission(identity, "service:read");
    return this.repository.list(tenantId, elderId);
  }

  async create(
    identity: IdentityContext,
    elderId: string,
    input: unknown,
  ): Promise<ServicePeriodRecord> {
    const tenantId = this.requirePermission(identity, "service:write");
    const parsed = createServicePeriodSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_SERVICE_PERIOD",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await this.repository.create(
      tenantId,
      elderId,
      parsed.data as CreateServicePeriodInput,
    );
    if (result.outcome === "ELDER_NOT_FOUND") {
      throw new NotFoundException("当前机构中未找到该老人档案。");
    }
    if (result.outcome === "DUPLICATE") {
      throw new ConflictException("该老人相同月份和服务形态的周期已存在。");
    }
    return result.record;
  }

  private requirePermission(
    identity: IdentityContext,
    permission: "service:read" | "service:write",
  ): string {
    if (
      !identity.tenantId ||
      !hasPermission(identity, permission, identity.tenantId)
    ) {
      throw new ForbiddenException("无权访问该机构的服务周期。");
    }
    return identity.tenantId;
  }
}
