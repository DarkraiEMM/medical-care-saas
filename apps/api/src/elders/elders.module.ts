import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { ELDER_REPOSITORY } from "./elder-repository.js";
import { EldersController } from "./elders.controller.js";
import { EldersService } from "./elders.service.js";
import { LocalSqliteElderRepository } from "./local-sqlite-elder.repository.js";

@Module({
  controllers: [EldersController],
  providers: [
    EldersService,
    DevIdentityGuard,
    {
      provide: ELDER_REPOSITORY,
      useFactory: () => {
        const mode = process.env.DATABASE_MODE || "local-sqlite";
        if (mode !== "local-sqlite") {
          throw new Error(`DATABASE_MODE_NOT_IMPLEMENTED:${mode}`);
        }
        return new LocalSqliteElderRepository();
      },
    },
  ],
})
export class EldersModule {}
