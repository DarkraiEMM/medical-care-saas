import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { BusinessRepository } from "./business.repository.js";

function current(request: RequestWithIdentity) {
  if (!request.identity?.tenantId)
    throw new BadRequestException("当前账号未关联机构");
  return {
    tenantId: request.identity.tenantId,
    actorId: request.identity.actorId,
  };
}

function run<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : "业务操作失败",
    );
  }
}

@Controller("organization")
@UseGuards(DevIdentityGuard)
export class BusinessController {
  constructor(
    @Inject(BusinessRepository) private readonly repo: BusinessRepository,
  ) {}

  @Get("business-overview") overview(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.overview(ctx.tenantId) };
  }

  @Get("departments") departments(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listDepartments(ctx.tenantId) };
  }
  @Post("departments") createDepartment(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createDepartment(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("staff-directory") staff(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listStaff(ctx.tenantId) };
  }
  @Post("staff-directory") createStaff(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createStaff(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("staff-performance") staffPerformance(
    @Req() request: RequestWithIdentity,
    @Query("month") month?: string,
  ) {
    const ctx = current(request);
    return {
      data: this.repo.listStaffPerformance(
        ctx.tenantId,
        month || new Date().toISOString().slice(0, 7),
      ),
    };
  }

  @Get("performance-templates") performanceTemplates() {
    return { data: this.repo.listPerformanceTemplates() };
  }

  @Get("performance-schemes") performanceSchemes(
    @Req() request: RequestWithIdentity,
  ) {
    const ctx = current(request);
    return { data: this.repo.listPerformanceSchemes(ctx.tenantId) };
  }

  @Post("performance-schemes") publishPerformanceScheme(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.publishPerformanceScheme(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("sales-records") salesRecords(
    @Req() request: RequestWithIdentity,
    @Query("month") month?: string,
  ) {
    const ctx = current(request);
    return {
      data: this.repo.listSalesRecords(
        ctx.tenantId,
        month || new Date().toISOString().slice(0, 7),
      ),
    };
  }

  @Post("sales-records") createSalesRecord(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createSalesRecord(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Post("sales-records/:id/action") salesRecordAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    return {
      data: run(() =>
        this.repo.salesRecordAction(
          ctx.tenantId,
          id,
          String(value.action || ""),
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("performance-statements") performanceStatements(
    @Req() request: RequestWithIdentity,
    @Query("month") month?: string,
  ) {
    const ctx = current(request);
    return {
      data: this.repo.listPerformanceStatements(
        ctx.tenantId,
        month || new Date().toISOString().slice(0, 7),
      ),
    };
  }

  @Post("performance-statements/calculate") calculatePerformanceStatements(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    return {
      data: run(() =>
        this.repo.calculatePerformanceStatements(
          ctx.tenantId,
          String(value.month || ""),
          ctx.actorId,
        ),
      ),
    };
  }

  @Post("performance-statements/:id/adjust") adjustPerformanceStatement(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const data = run(() =>
      this.repo.adjustPerformanceStatement(
        ctx.tenantId,
        id,
        (body || {}) as Record<string, unknown>,
        ctx.actorId,
      ),
    );
    if (!data) throw new NotFoundException("未找到绩效单");
    return { data };
  }

  @Post("performance-statements/:id/confirm") confirmPerformanceStatement(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.confirmPerformanceStatement(ctx.tenantId, id, ctx.actorId),
      ),
    };
  }

  @Get("contracts") contracts(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listContracts(ctx.tenantId) };
  }
  @Post("contracts") createContract(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createContract(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }
  @Post("contracts/:id/action") contractAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    const data = run(() =>
      this.repo.contractAction(
        ctx.tenantId,
        id,
        String(value.action || ""),
        ctx.actorId,
      ),
    );
    if (!data) throw new NotFoundException("未找到合同");
    return { data };
  }

  @Get("subsidies") subsidies(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listSubsidies(ctx.tenantId) };
  }
  @Post("subsidies") createSubsidy(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createSubsidy(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }
  @Post("subsidies/:id/action") subsidyAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    const data = run(() =>
      this.repo.subsidyAction(
        ctx.tenantId,
        id,
        String(value.action || ""),
        String(value.reason || ""),
        ctx.actorId,
      ),
    );
    if (!data) throw new NotFoundException("未找到核销台账");
    return { data };
  }

  @Get("promotion-assets") promotion(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listPromotion(ctx.tenantId) };
  }
  @Post("promotion-assets") createPromotion(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createPromotion(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }
  @Post("promotion-assets/:id/action") promotionAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    const data = run(() =>
      this.repo.promotionAction(
        ctx.tenantId,
        id,
        String(value.action || ""),
        ctx.actorId,
      ),
    );
    if (!data) throw new NotFoundException("未找到宣传素材");
    return { data };
  }

  @Get("food-traces") food(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listFood(ctx.tenantId) };
  }
  @Post("food-traces") createFood(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createFood(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Post("food-traces/:id/action") foodAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    return {
      data: run(() =>
        this.repo.foodAction(
          ctx.tenantId,
          id,
          String(value.action || ""),
          String(value.reason || ""),
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("engagements") engagements(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listEngagements(ctx.tenantId) };
  }
  @Post("engagements") createEngagement(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.createEngagement(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }

  @Get("archives") archives(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.listArchives(ctx.tenantId) };
  }
  @Post("archives/:id/action") archiveAction(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    const value = (body || {}) as Record<string, unknown>;
    const data = run(() =>
      this.repo.archiveAction(
        ctx.tenantId,
        id,
        String(value.action || ""),
        ctx.actorId,
      ),
    );
    if (!data) throw new NotFoundException("未找到归档记录");
    return { data };
  }

  @Get("settings") settings(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: this.repo.getSettings(ctx.tenantId) };
  }
  @Post("settings") saveSettings(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.saveSettings(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        ),
      ),
    };
  }
}

@Controller("staff")
@UseGuards(DevIdentityGuard)
export class StaffBusinessController {
  constructor(
    @Inject(BusinessRepository) private readonly repo: BusinessRepository,
  ) {}

  @Get("directory-profile") profile(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: run(() => this.repo.getStaffProfile(ctx.tenantId, ctx.actorId)) };
  }

  @Get("applications") applications(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: run(() => this.repo.getStaffApplications(ctx.tenantId, ctx.actorId)) };
  }

  @Get("me/work-summary") workSummary(
    @Req() request: RequestWithIdentity,
    @Query("month") month?: string,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.getStaffWorkSummary(
          ctx.tenantId,
          ctx.actorId,
          month || new Date().toISOString().slice(0, 7),
        ),
      ),
    };
  }

  @Get("attendance/today") attendance(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return { data: run(() => this.repo.getAttendanceToday(ctx.tenantId, ctx.actorId)) };
  }

  @Post("attendance/check") checkAttendance(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.checkAttendance(
          ctx.tenantId,
          ctx.actorId,
          (body || {}) as Record<string, unknown>,
        ),
      ),
    };
  }

  @Post("media") uploadMedia(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() =>
        this.repo.uploadBusinessMedia(
          ctx.tenantId,
          ctx.actorId,
          (body || {}) as Record<string, unknown>,
        ),
      ),
    };
  }

  @Get("media/:id") media(
    @Req() request: RequestWithIdentity,
    @Param("id") id: string,
  ) {
    const ctx = current(request);
    const data = this.repo.getBusinessMedia(ctx.tenantId, id);
    if (!data) throw new NotFoundException("未找到该材料");
    return { data };
  }

  @Get("food-trace-records") foodRecords(@Req() request: RequestWithIdentity) {
    const ctx = current(request);
    return {
      data: run(() => {
        const applications = this.repo.getStaffApplications(ctx.tenantId, ctx.actorId);
        if (!applications.foodTrace.enabled) throw new Error("当前账号未开通食品追溯");
        return this.repo.listFood(ctx.tenantId);
      }),
    };
  }

  @Post("food-trace-records") createFoodRecord(
    @Req() request: RequestWithIdentity,
    @Body() body: unknown,
  ) {
    const ctx = current(request);
    return {
      data: run(() => {
        const applications = this.repo.getStaffApplications(ctx.tenantId, ctx.actorId);
        if (!applications.foodTrace.enabled) throw new Error("当前账号未开通食品追溯");
        return this.repo.createFood(
          ctx.tenantId,
          (body || {}) as Record<string, unknown>,
          ctx.actorId,
        );
      }),
    };
  }
}
