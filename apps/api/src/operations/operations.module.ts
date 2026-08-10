import { Module } from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import {
  OrganizationOperationsController,
  PlatformOperationsController,
  StaffOperationsController,
} from "./operations.controller.js";
import { OperationsRepository } from "./operations.repository.js";

@Module({
  controllers: [StaffOperationsController, OrganizationOperationsController, PlatformOperationsController],
  providers: [OperationsRepository, DevIdentityGuard],
})
export class OperationsModule {}
