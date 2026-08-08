import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PilotModule } from "./pilot/pilot.module.js";

@Module({
  imports: [PilotModule],
  controllers: [HealthController],
})
export class AppModule {}
