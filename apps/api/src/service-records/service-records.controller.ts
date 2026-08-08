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
import { ServiceRecordsService } from "./service-records.service.js";

@Controller("organization/service-periods/:periodId/records")
@UseGuards(DevIdentityGuard)
// Record routes inherit tenant scope from the authenticated service period.
export class ServiceRecordsController {
  constructor(
    @Inject(ServiceRecordsService)
    private readonly serviceRecordsService: ServiceRecordsService,
  ) {}

  @Get()
  async list(
    @Req() request: RequestWithIdentity,
    @Param("periodId") periodId: string,
  ): Promise<unknown> {
    return {
      data: await this.serviceRecordsService.list(
        this.identity(request),
        periodId,
      ),
    };
  }

  @Post()
  async create(
    @Req() request: RequestWithIdentity,
    @Param("periodId") periodId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return {
      data: await this.serviceRecordsService.create(
        this.identity(request),
        periodId,
        body,
      ),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
