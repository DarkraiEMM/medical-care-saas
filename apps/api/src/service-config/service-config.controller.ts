import type { IdentityContext } from "@care/domain";
import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { ServiceConfigService } from "./service-config.service.js";

@Controller("organization/service-workspace-config")
@UseGuards(DevIdentityGuard)
export class ServiceConfigController {
  constructor(
    @Inject(ServiceConfigService)
    private readonly serviceConfigService: ServiceConfigService,
  ) {}

  @Get()
  async get(@Req() request: RequestWithIdentity): Promise<unknown> {
    return {
      data: await this.serviceConfigService.get(this.identity(request)),
    };
  }

  @Post()
  async update(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ): Promise<unknown> {
    return {
      data: await this.serviceConfigService.update(
        this.identity(request),
        body,
      ),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
