import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Role } from "@care/domain";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RequestWithIdentity } from "./identity-context.js";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class DevIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === "production" || process.env.AUTH_MODE !== "local-mock") {
      throw new UnauthorizedException("真实身份提供方尚未配置，拒绝使用开发身份。");
    }

    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const tenantId = firstHeader(request.headers["x-dev-tenant-id"]);
    const actorId = firstHeader(request.headers["x-dev-actor-id"]) ?? "local-developer";
    const roleHeader = firstHeader(request.headers["x-dev-role"]) ?? "TENANT_ADMIN";
    const allowedRoles: Role[] = [
      "TENANT_ADMIN",
      "DEPARTMENT_MANAGER",
      "FRONTLINE_STAFF",
      "SUBSIDY_OPERATOR",
      "PLATFORM_OPERATOR",
    ];

    if ((!tenantId && roleHeader !== "PLATFORM_OPERATOR") || !allowedRoles.includes(roleHeader as Role)) {
      throw new UnauthorizedException("登录信息已失效，请重新进入。");
    }

    if (tenantId) this.assertTenantAccess(tenantId, request.method ?? "GET");

    request.identity = {
      actorId,
      tenantId: tenantId ?? null,
      roles: [roleHeader as Role],
      departmentIds: [],
      active: true,
    };
    return true;
  }

  private assertTenantAccess(tenantId: string, method: string): void {
    const databasePath = process.env.LOCAL_SQLITE_PATH?.trim()
      ? resolve(process.env.LOCAL_SQLITE_PATH.trim())
      : resolve(process.cwd(), ".local-data", "care-dev.sqlite");
    const db = new DatabaseSync(databasePath);
    try {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'demo_tenants'")
        .get();
      if (!table) return;

      const tenant = db.prepare("SELECT status FROM demo_tenants WHERE id = ?").get(tenantId) as
        | { status: string }
        | undefined;
      if (!tenant) return;
      if (tenant.status === "SUSPENDED") {
        throw new ForbiddenException("当前机构已停用，请联系平台运营人员。");
      }
      if (tenant.status === "READ_ONLY" && method.toUpperCase() !== "GET") {
        throw new ForbiddenException("当前机构处于只读状态，不能提交变更。");
      }
    } finally {
      db.close();
    }
  }
}
