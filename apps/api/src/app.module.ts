import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { EldersModule } from "./elders/elders.module.js";
import { PilotModule } from "./pilot/pilot.module.js";
import { ServicePeriodsModule } from "./service-periods/service-periods.module.js";

@Module({
  imports: [EldersModule, PilotModule, ServicePeriodsModule],
  controllers: [HealthController],
})
export class AppModule {}
