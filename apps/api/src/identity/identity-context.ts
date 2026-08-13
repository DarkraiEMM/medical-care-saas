import type { IdentityContext } from "@care/domain";

export const IDENTITY_CONTEXT = Symbol("IDENTITY_CONTEXT");

export interface RequestWithIdentity {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  identity?: IdentityContext;
}
