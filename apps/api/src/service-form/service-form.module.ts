import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { LocalSqliteServiceFormRepository } from "./local-sqlite-service-form.repository.js";
import { SERVICE_FORM_REPOSITORY } from "./service-form-repository.js";
import { ServiceFormController } from "./service-form.controller.js";
import { ServiceFormService } from "./service-form.service.js";

@Module({
  controllers: [ServiceFormController],
  providers: [
    ServiceFormService,
    DevIdentityGuard,
    {
      provide: SERVICE_FORM_REPOSITORY,
      useFactory: () => new LocalSqliteServiceFormRepository(),
    },
  ],
  exports: [ServiceFormService],
})
export class ServiceFormModule {}
