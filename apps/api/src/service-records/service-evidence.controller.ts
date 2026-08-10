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

@Controller("organization/service-records/:recordId/evidence")
@UseGuards(DevIdentityGuard)
export class ServiceEvidenceController {
  constructor(
    @Inject(ServiceRecordsService)
    private readonly serviceRecordsService: ServiceRecordsService,
  ) {}

  @Get()
  async list(
    @Req() request: RequestWithIdentity,
    @Param("recordId") recordId: string,
  ): Promise<unknown> {
    return {
      data: await this.serviceRecordsService.listEvidence(
        this.identity(request),
        recordId,
      ),
    };
  }

  @Post()
  async upload(
    @Req() request: RequestWithIdentity,
    @Param("recordId") recordId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return {
      data: await this.serviceRecordsService.uploadEvidence(
        this.identity(request),
        recordId,
        body,
      ),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
