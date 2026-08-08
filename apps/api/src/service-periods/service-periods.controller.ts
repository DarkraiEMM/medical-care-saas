import type { IdentityContext } from "@care/domain";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { ServicePeriodsService } from "./service-periods.service.js";

@Controller("organization/elders/:elderId/service-periods")
@UseGuards(DevIdentityGuard)
// The authenticated tenant is resolved by the guard; elderId alone never grants access.
export class ServicePeriodsController {
  constructor(
    @Inject(ServicePeriodsService)
    private readonly servicePeriodsService: ServicePeriodsService,
  ) {}

  @Get()
  async list(
    @Req() request: RequestWithIdentity,
    @Param("elderId") elderId: string,
  ): Promise<unknown> {
    return {
      data: await this.servicePeriodsService.list(
        this.identity(request),
        elderId,
      ),
    };
  }

  @Post()
  async create(
    @Req() request: RequestWithIdentity,
    @Param("elderId") elderId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return {
      data: await this.servicePeriodsService.create(
        this.identity(request),
        elderId,
        body,
      ),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
