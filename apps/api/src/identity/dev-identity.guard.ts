import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Role } from "@care/domain";
import type { RequestWithIdentity } from "./identity-context.js";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class DevIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.AUTH_MODE !== "local-mock"
    ) {
      throw new UnauthorizedException(
        "真实身份提供方尚未配置，拒绝使用开发身份。",
      );
    }

    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const tenantId = firstHeader(request.headers["x-dev-tenant-id"]);
    const actorId =
      firstHeader(request.headers["x-dev-actor-id"]) ?? "local-developer";
    const roleHeader =
      firstHeader(request.headers["x-dev-role"]) ?? "TENANT_ADMIN";
    const allowedRoles: Role[] = [
      "TENANT_ADMIN",
      "DEPARTMENT_MANAGER",
      "FRONTLINE_STAFF",
      "SUBSIDY_OPERATOR",
      "PLATFORM_OPERATOR",
    ];

    if (!tenantId || !allowedRoles.includes(roleHeader as Role)) {
      throw new UnauthorizedException("缺少有效的本地模拟身份头。");
    }

    request.identity = {
      actorId,
      tenantId,
      roles: [roleHeader as Role],
      departmentIds: [],
      active: true,
    };
    return true;
  }
}
