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
import { ServiceFormService } from "./service-form.service.js";

@Controller("organization")
@UseGuards(DevIdentityGuard)
export class ServiceFormController {
  constructor(
    @Inject(ServiceFormService)
    private readonly service: ServiceFormService,
  ) {}

  @Get("service-form-workspace")
  async get(@Req() request: RequestWithIdentity) {
    return { data: await this.service.get(this.identity(request)) };
  }

  @Post("service-form-template")
  async saveDraft(@Req() request: RequestWithIdentity, @Body() body: unknown) {
    return { data: await this.service.saveDraft(this.identity(request), body) };
  }

  @Post("service-form-template/publish")
  async publish(@Req() request: RequestWithIdentity) {
    return { data: await this.service.publish(this.identity(request)) };
  }

  @Post("qualifications/:code/upload")
  async uploadQualification(
    @Req() request: RequestWithIdentity,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    return {
      data: await this.service.uploadQualification(
        this.identity(request),
        code,
        body,
      ),
    };
  }

  @Post("qualifications/:code/submit")
  async submitQualification(
    @Req() request: RequestWithIdentity,
    @Param("code") code: string,
  ) {
    return {
      data: await this.service.submitQualification(
        this.identity(request),
        code,
      ),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
