export type Role =
  | "TENANT_ADMIN"
  | "DEPARTMENT_MANAGER"
  | "FRONTLINE_STAFF"
  | "SUBSIDY_OPERATOR"
  | "PLATFORM_OPERATOR";

export type Permission =
  | "elder:read"
  | "elder:write"
  | "service:read"
  | "service:write"
  | "service:review"
  | "subsidy:export"
  | "original-file:download"
  | "platform:operate";

export interface IdentityContext {
  actorId: string;
  tenantId: string | null;
  roles: Role[];
  departmentIds: string[];
  active: boolean;
  supportGrant?: {
    tenantId: string;
    permissions: Permission[];
    expiresAt: Date;
  };
}

const rolePermissions: Record<Role, readonly Permission[]> = {
  TENANT_ADMIN: [
    "elder:read",
    "elder:write",
    "service:read",
    "service:write",
    "service:review",
    "subsidy:export",
    "original-file:download",
  ],
  DEPARTMENT_MANAGER: [
    "elder:read",
    "service:read",
    "service:write",
    "service:review",
  ],
  FRONTLINE_STAFF: ["elder:read", "service:read", "service:write"],
  SUBSIDY_OPERATOR: ["elder:read", "service:read", "subsidy:export"],
  PLATFORM_OPERATOR: ["platform:operate"],
};

export function hasPermission(
  identity: IdentityContext,
  permission: Permission,
  resourceTenantId: string,
  now = new Date(),
): boolean {
  if (!identity.active) return false;

  if (identity.tenantId === resourceTenantId) {
    return identity.roles.some((role) =>
      rolePermissions[role].includes(permission),
    );
  }

  const grant = identity.supportGrant;
  return Boolean(
    identity.roles.includes("PLATFORM_OPERATOR") &&
    grant &&
    grant.tenantId === resourceTenantId &&
    grant.expiresAt > now &&
    grant.permissions.includes(permission),
  );
}

export function assertTenantAccess(
  identity: IdentityContext,
  permission: Permission,
  resourceTenantId: string,
  now = new Date(),
): void {
  if (!hasPermission(identity, permission, resourceTenantId, now)) {
    throw new Error("FORBIDDEN_TENANT_OR_PERMISSION");
  }
}
