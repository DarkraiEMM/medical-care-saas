import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { IdentityContext } from "@care/domain";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { EldersService } from "./elders.service.js";

@Controller("organization/elders")
@UseGuards(DevIdentityGuard)
export class EldersController {
  constructor(
    @Inject(EldersService) private readonly eldersService: EldersService,
  ) {}

  @Get()
  async list(@Req() request: RequestWithIdentity): Promise<unknown> {
    return { data: await this.eldersService.list(this.identity(request)) };
  }

  @Post()
  async create(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ): Promise<unknown> {
    return {
      data: await this.eldersService.create(this.identity(request), body),
    };
  }

  private identity(request: RequestWithIdentity): IdentityContext {
    if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
    return request.identity;
  }
}
