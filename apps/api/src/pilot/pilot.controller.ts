import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { IdentityContext } from "@care/domain";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { PilotService } from "./pilot.service.js";

@Controller("pilot")
@UseGuards(DevIdentityGuard)
export class PilotController {
  constructor(
    @Inject(PilotService) private readonly pilotService: PilotService,
  ) {}

  @Get("elders")
  listElders(@Req() request: RequestWithIdentity): unknown {
    return { data: this.pilotService.listElders(this.identity(request)) };
  }

  @Get("elders/:id")
  getElder(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
  ): unknown {
    const elder = this.pilotService.getElder(this.identity(request), id);
    if (!elder) throw new NotFoundException("未找到老人档案。");
    return { data: elder };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
