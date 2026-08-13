import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { LocalSqliteServiceConfigRepository } from "./local-sqlite-service-config.repository.js";
import { SERVICE_CONFIG_REPOSITORY } from "./service-config-repository.js";
import { ServiceConfigController } from "./service-config.controller.js";
import { ServiceConfigService } from "./service-config.service.js";

@Module({
  controllers: [ServiceConfigController],
  providers: [
    ServiceConfigService,
    DevIdentityGuard,
    {
      provide: SERVICE_CONFIG_REPOSITORY,
      useFactory: () => new LocalSqliteServiceConfigRepository(),
    },
  ],
  exports: [ServiceConfigService],
})
export class ServiceConfigModule {}
