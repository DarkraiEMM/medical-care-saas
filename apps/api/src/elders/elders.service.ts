import { createElderSchema, type CreateElderInput } from "@care/contracts";
import { hasPermission, type IdentityContext } from "@care/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  ELDER_REPOSITORY,
  type ElderArchiveRecord,
  type ElderRepository,
} from "./elder-repository.js";

@Injectable()
export class EldersService {
  constructor(
    @Inject(ELDER_REPOSITORY) private readonly repository: ElderRepository,
  ) {}

  async list(identity: IdentityContext): Promise<ElderArchiveRecord[]> {
    const tenantId = this.requirePermission(identity, "elder:read");
    return this.repository.list(tenantId);
  }

  async create(
    identity: IdentityContext,
    input: unknown,
  ): Promise<ElderArchiveRecord> {
    const tenantId = this.requirePermission(identity, "elder:write");
    const parsed = createElderSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ELDER_ARCHIVE",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return this.repository.create(tenantId, parsed.data as CreateElderInput);
  }

  private requirePermission(
    identity: IdentityContext,
    permission: "elder:read" | "elder:write",
  ): string {
    if (
      !identity.tenantId ||
      !hasPermission(identity, permission, identity.tenantId)
    ) {
      throw new ForbiddenException("无权访问该机构档案。");
    }
    return identity.tenantId;
  }
}
