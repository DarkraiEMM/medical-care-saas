import { updateServiceWorkspaceConfigSchema } from "@care/contracts";
import { hasPermission, type IdentityContext } from "@care/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  SERVICE_CONFIG_REPOSITORY,
  type ServiceConfigRepository,
  type ServiceWorkspaceConfig,
} from "./service-config-repository.js";

@Injectable()
export class ServiceConfigService {
  constructor(
    @Inject(SERVICE_CONFIG_REPOSITORY)
    private readonly repository: ServiceConfigRepository,
  ) {}

  async get(identity: IdentityContext): Promise<ServiceWorkspaceConfig> {
    return this.repository.get(
      this.requirePermission(identity, "service:read"),
    );
  }

  async update(
    identity: IdentityContext,
    input: unknown,
  ): Promise<ServiceWorkspaceConfig> {
    const tenantId = this.requirePermission(identity, "service:write");
    const parsed = updateServiceWorkspaceConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_SERVICE_CONFIG",
        issues: parsed.error.issues,
      });
    }
    return this.repository.update(tenantId, parsed.data);
  }

  private requirePermission(
    identity: IdentityContext,
    permission: "service:read" | "service:write",
  ): string {
    if (
      !identity.tenantId ||
      !hasPermission(identity, permission, identity.tenantId)
    ) {
      throw new ForbiddenException("无权访问该机构的服务模块配置。");
    }
    return identity.tenantId;
  }
}
