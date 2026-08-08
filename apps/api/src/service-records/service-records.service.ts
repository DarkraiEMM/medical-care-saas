import {
  createServiceRecordSchema,
  type CreateServiceRecordInput,
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
  SERVICE_RECORD_REPOSITORY,
  type ServiceRecordEntry,
  type ServiceRecordRepository,
} from "./service-record-repository.js";

@Injectable()
export class ServiceRecordsService {
  constructor(
    @Inject(SERVICE_RECORD_REPOSITORY)
    private readonly repository: ServiceRecordRepository,
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
    const result = await this.repository.create(
      tenantId,
      parsed.data as CreateServiceRecordInput,
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
}
