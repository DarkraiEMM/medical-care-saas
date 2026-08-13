import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import { BusinessController, StaffBusinessController } from "./business.controller.js";
import { BusinessRepository } from "./business.repository.js";

@Module({
  controllers: [BusinessController, StaffBusinessController],
  providers: [BusinessRepository, DevIdentityGuard],
})
export class BusinessModule {}
