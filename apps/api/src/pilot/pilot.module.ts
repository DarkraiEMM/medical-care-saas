import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { PilotController } from "./pilot.controller.js";
import { PilotService } from "./pilot.service.js";

@Module({
  controllers: [PilotController],
  providers: [PilotService, DevIdentityGuard],
})
export class PilotModule {}
