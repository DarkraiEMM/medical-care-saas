import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { LocalSqliteServicePeriodRepository } from "./local-sqlite-service-period.repository.js";
import { SERVICE_PERIOD_REPOSITORY } from "./service-period-repository.js";
import { ServicePeriodsController } from "./service-periods.controller.js";
import { ServicePeriodsService } from "./service-periods.service.js";

@Module({
  controllers: [ServicePeriodsController],
  providers: [
    ServicePeriodsService,
    DevIdentityGuard,
    {
      provide: SERVICE_PERIOD_REPOSITORY,
      useFactory: () => {
        const mode = process.env.DATABASE_MODE || "local-sqlite";
        if (mode !== "local-sqlite") {
          throw new Error(`DATABASE_MODE_NOT_IMPLEMENTED:${mode}`);
        }
        return new LocalSqliteServicePeriodRepository();
      },
    },
  ],
})
export class ServicePeriodsModule {}
