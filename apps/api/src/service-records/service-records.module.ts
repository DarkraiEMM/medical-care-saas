import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { ServiceConfigModule } from "../service-config/service-config.module.js";
import { ServiceFormModule } from "../service-form/service-form.module.js";
import { LocalSqliteServiceRecordRepository } from "./local-sqlite-service-record.repository.js";
import { SERVICE_RECORD_REPOSITORY } from "./service-record-repository.js";
import { ServiceEvidenceController } from "./service-evidence.controller.js";
import { ServiceRecordsController } from "./service-records.controller.js";
import { ServiceRecordsService } from "./service-records.service.js";

@Module({
  imports: [ServiceConfigModule, ServiceFormModule],
  controllers: [ServiceRecordsController, ServiceEvidenceController],
  providers: [
    ServiceRecordsService,
    DevIdentityGuard,
    {
      provide: SERVICE_RECORD_REPOSITORY,
      useFactory: () => {
        const mode = process.env.DATABASE_MODE || "local-sqlite";
        if (mode !== "local-sqlite") {
          throw new Error(`DATABASE_MODE_NOT_IMPLEMENTED:${mode}`);
        }
        return new LocalSqliteServiceRecordRepository();
      },
    },
  ],
})
export class ServiceRecordsModule {}
