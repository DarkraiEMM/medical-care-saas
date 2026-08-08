import { describe, expect, it } from "vitest";
import { hasPermission, type IdentityContext } from "./permissions.js";

describe("tenant permission boundary", () => {
  const tenantAdmin: IdentityContext = {
    actorId: "user-a",
    tenantId: "tenant-a",
    roles: ["TENANT_ADMIN"],
    departmentIds: ["care"],
    active: true,
  };

  it("allows access inside the actor tenant", () => {
    expect(hasPermission(tenantAdmin, "elder:read", "tenant-a")).toBe(true);
  });

  it("denies access to another tenant even for tenant admin", () => {
    expect(hasPermission(tenantAdmin, "elder:read", "tenant-b")).toBe(false);
  });

  it("requires an unexpired explicit grant for platform support", () => {
    const platformOperator: IdentityContext = {
      actorId: "platform-user",
      tenantId: null,
      roles: ["PLATFORM_OPERATOR"],
      departmentIds: [],
      active: true,
      supportGrant: {
        tenantId: "tenant-a",
        permissions: ["elder:read"],
        expiresAt: new Date("2026-08-08T16:00:00Z"),
      },
    };

    expect(
      hasPermission(
        platformOperator,
        "elder:read",
        "tenant-a",
        new Date("2026-08-08T15:00:00Z"),
      ),
    ).toBe(true);
    expect(
      hasPermission(
        platformOperator,
        "elder:read",
        "tenant-a",
        new Date("2026-08-08T17:00:00Z"),
      ),
    ).toBe(false);
    expect(
      hasPermission(
        platformOperator,
        "original-file:download",
        "tenant-a",
        new Date("2026-08-08T15:00:00Z"),
      ),
    ).toBe(false);
  });
});
