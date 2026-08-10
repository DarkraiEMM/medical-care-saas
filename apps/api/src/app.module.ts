import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { EldersModule } from "./elders/elders.module.js";
import { PilotModule } from "./pilot/pilot.module.js";
import { ServiceConfigModule } from "./service-config/service-config.module.js";
import { ServiceFormModule } from "./service-form/service-form.module.js";
import { ServiceRecordsModule } from "./service-records/service-records.module.js";
import { ServicePeriodsModule } from "./service-periods/service-periods.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { BusinessModule } from "./business/business.module.js";

@Module({
  imports: [
    EldersModule,
    PilotModule,
    ServiceConfigModule,
    ServiceFormModule,
    ServicePeriodsModule,
    ServiceRecordsModule,
    OperationsModule,
    BusinessModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
