import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { EldersModule } from "./elders/elders.module.js";
import { PilotModule } from "./pilot/pilot.module.js";

@Module({
  imports: [EldersModule, PilotModule],
  controllers: [HealthController],
})
export class AppModule {}
