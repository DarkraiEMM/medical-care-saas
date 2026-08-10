import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DevIdentityGuard } from "../identity/dev-identity.guard.js";
import type { RequestWithIdentity } from "../identity/identity-context.js";
import { fallbackServiceForm, OperationsRepository, type StageCode } from "./operations.repository.js";

function identity(request: RequestWithIdentity) {
  if (!request.identity) throw new Error("IDENTITY_GUARD_NOT_APPLIED");
  return request.identity;
}

function translate(error: unknown): never {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "TENANT_SUSPENDED") throw new ForbiddenException("当前机构已停用。");
  if (message === "TASK_BASIC_INFO_REQUIRED") throw new BadRequestException("请完整填写服务对象、档案号和服务时间。");
  if (message === "SERVICE_ITEM_REQUIRED") throw new BadRequestException("请至少选择一个服务项目。");
  if (message.startsWith("SERVICE_QUALIFICATION_REQUIRED:")) {
    const names: Record<string, string> = {
      HEALTH_SERVICE_OPERATION: "健康服务相关资质",
      REHABILITATION_SERVICE: "康复服务相关资质",
      PROFESSIONAL_NURSING: "专业护理相关资质",
    };
    const missing = message
      .replace("SERVICE_QUALIFICATION_REQUIRED:", "")
      .split(",")
      .map((code) => names[code] || code)
      .join("、");
    throw new BadRequestException(`${missing}尚未通过平台审核，暂不能派发对应服务。`);
  }
  if (message === "RESPONSIBLE_REQUIRED") throw new BadRequestException("请选择任务负责人。");
  if (message === "RESPONSIBLE_DUPLICATED") throw new BadRequestException("负责人不能重复选择为协作人员。");
  if (message === "TASK_PARTICIPANT_REQUIRED") throw new ForbiddenException("只有负责人或参与人员可以填写阶段记录。");
  if (message === "TASK_OWNER_REQUIRED") throw new ForbiddenException("只有任务负责人可以提交审核。");
  if (message === "TASK_NOT_EDITABLE") throw new BadRequestException("当前任务状态不允许修改或再次提交。");
  if (message === "TASK_NOT_REVIEWABLE") throw new BadRequestException("当前任务尚未提交审核，不能执行审核操作。");
  if (message === "RETURN_REASON_REQUIRED") throw new BadRequestException("退回时必须填写具体原因。");
  if (message === "RETURN_FIELD_INVALID") throw new BadRequestException("选择的待修改内容不属于当前阶段，请重新选择。");
  if (message.startsWith("MISSING_STAGES")) {
    const stageNames: Record<string, string> = {
      BEFORE: "服务前",
      DURING: "服务中",
      AFTER: "服务后",
    };
    const missing = message
      .replace("MISSING_STAGES:", "")
      .split(",")
      .map((stage) => stageNames[stage] || stage)
      .join("、");
    throw new BadRequestException(`请先完成${missing}阶段记录。`);
  }
  if (message.startsWith("MISSING_REQUIRED_FIELDS")) throw new BadRequestException(`请填写必填内容：${message.replace("MISSING_REQUIRED_FIELDS:", "")}`);
  if (message === "INVALID_TEST_EVIDENCE") throw new BadRequestException("图片无效或超过5MB。");
  if (message === "CUSTOMER_FEEDBACK_DISABLED") throw new BadRequestException("当前任务未启用客户反馈。");
  if (message === "CUSTOMER_FEEDBACK_MEDIA_INVALID") throw new BadRequestException("反馈材料无效，请重新上传。");
  if (message.includes("REQUIRED")) throw new BadRequestException(message);
  throw error;
}

@Controller("staff")
@UseGuards(DevIdentityGuard)
export class StaffOperationsController {
  constructor(@Inject(OperationsRepository) private readonly repo: OperationsRepository) {}

  @Get("me")
  me(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    this.repo.assertTenantActive(current.tenantId || "");
    return { data: { actorId: current.actorId, tenantId: current.tenantId, displayName: "刘阿姨", departments: ["护理部", "上门服务组"], isDemo: true } };
  }

  @Get("tasks")
  tasks(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    try { return { data: this.repo.listTasks(current.tenantId || "", current.actorId) }; } catch (error) { translate(error); }
  }

  @Get("form-template")
  formTemplate(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    return { data: this.repo.getPublishedForm(current.tenantId || "") || fallbackServiceForm };
  }

  @Get("tasks/:taskId")
  task(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string) {
    const current = identity(request);
    try {
      const data = this.repo.getTask(current.tenantId || "", taskId);
      if (!data) throw new NotFoundException("未找到服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }

  @Post("tasks/:taskId/stages/:stage")
  saveStage(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string, @Param("stage") stage: string, @Body() body: unknown) {
    if (!["BEFORE", "DURING", "AFTER"].includes(stage)) throw new BadRequestException("无效阶段。");
    const current = identity(request);
    try {
      const data = this.repo.saveStage(current.tenantId || "", taskId, stage as StageCode, (body || {}) as Record<string, unknown>, current.actorId);
      if (!data) throw new NotFoundException("未找到该服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }

  @Post("tasks/:taskId/submit")
  submit(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string) {
    const current = identity(request);
    try {
      const data = this.repo.submitTask(current.tenantId || "", taskId, current.actorId);
      if (!data) throw new NotFoundException("未找到该服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }

  @Get("tasks/:taskId/customer-feedback")
  feedback(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string) {
    const current = identity(request);
    try {
      const data = this.repo.getCustomerFeedback(current.tenantId || "", taskId, current.actorId);
      if (!data) throw new NotFoundException("未找到该服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }

  @Post("tasks/:taskId/customer-feedback")
  saveFeedback(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string, @Body() body: unknown) {
    const current = identity(request);
    try {
      const data = this.repo.saveCustomerFeedback(current.tenantId || "", taskId, (body || {}) as Record<string, unknown>, current.actorId);
      if (!data) throw new NotFoundException("未找到该服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }
}

@Controller("organization/operations")
@UseGuards(DevIdentityGuard)
export class OrganizationOperationsController {
  constructor(@Inject(OperationsRepository) private readonly repo: OperationsRepository) {}

  @Get("overview")
  overview(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    try { return { data: { ...this.repo.overview(current.tenantId || ""), tenant: this.repo.getTenant(current.tenantId || "") } }; } catch (error) { translate(error); }
  }

  @Get("tasks")
  tasks(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    try { return { data: this.repo.listTasks(current.tenantId || "") }; } catch (error) { translate(error); }
  }

  @Post("tasks")
  createTask(@Req() request: RequestWithIdentity, @Body() body: unknown) {
    const current = identity(request);
    try { return { data: this.repo.createTask(current.tenantId || "", (body || {}) as Record<string, unknown>, current.actorId) }; }
    catch (error) { translate(error); }
  }

  @Post("tasks/:taskId/review")
  review(@Req() request: RequestWithIdentity, @Param("taskId") taskId: string, @Body() body: unknown) {
    const current = identity(request);
    const value = (body || {}) as Record<string, unknown>;
    const action = value.action === "APPROVE" ? "APPROVE" : "RETURN";
    const issues = Array.isArray(value.issues)
      ? (value.issues as Array<Record<string, unknown>>)
      : value.reason
        ? [{ stage: value.stage || "AFTER", fieldId: value.fieldId, fieldLabel: value.fieldLabel || "阶段记录", reason: value.reason }]
        : [];
    try {
      const data = this.repo.reviewTask(current.tenantId || "", taskId, action, issues, current.actorId);
      if (!data) throw new NotFoundException("未找到该服务任务。");
      return { data };
    } catch (error) { translate(error); }
  }

  @Get("support-grants")
  grants(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    return { data: this.repo.listSupportGrants(current.tenantId || "") };
  }

  @Post("support-grants")
  createGrant(@Req() request: RequestWithIdentity, @Body() body: unknown) {
    const current = identity(request);
    return { data: this.repo.createSupportGrant(current.tenantId || "", (body || {}) as Record<string, unknown>, current.actorId) };
  }

  @Post("support-grants/:grantId/revoke")
  revoke(@Req() request: RequestWithIdentity, @Param("grantId") grantId: string) {
    const current = identity(request);
    const data = this.repo.revokeSupportGrant(current.tenantId || "", grantId, current.actorId);
    if (!data) throw new NotFoundException("未找到有效授权。");
    return { data };
  }

  @Get("audit")
  audit(@Req() request: RequestWithIdentity) {
    const current = identity(request);
    return { data: this.repo.listAudit(current.tenantId || "") };
  }
}

@Controller("platform")
@UseGuards(DevIdentityGuard)
export class PlatformOperationsController {
  constructor(@Inject(OperationsRepository) private readonly repo: OperationsRepository) {}

  private platform(request: RequestWithIdentity) {
    const current = identity(request);
    if (!current.roles.includes("PLATFORM_OPERATOR")) throw new ForbiddenException("需要平台运营权限。");
    return current;
  }

  @Get("overview")
  overview(@Req() request: RequestWithIdentity) { this.platform(request); return { data: this.repo.overview() }; }

  @Get("tenants")
  tenants(@Req() request: RequestWithIdentity) { this.platform(request); return { data: this.repo.listTenants() }; }

  @Get("subscription-plans")
  subscriptionPlans(@Req() request: RequestWithIdentity) {
    this.platform(request);
    return { data: this.repo.listSubscriptionPlans() };
  }

  @Get("qualifications")
  qualifications(@Req() request: RequestWithIdentity) {
    this.platform(request);
    return { data: this.repo.listQualifications() };
  }

  @Post("qualifications/:tenantId/:code/review")
  reviewQualification(
    @Req() request: RequestWithIdentity,
    @Param("tenantId") tenantId: string,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    const current = this.platform(request);
    try {
      const data = this.repo.reviewQualification(
        tenantId,
        code,
        (body || {}) as Record<string, unknown>,
        current.actorId,
      );
      if (!data) throw new NotFoundException("未找到该机构资质记录。");
      return { data };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "QUALIFICATION_NOT_REVIEWABLE") {
        throw new BadRequestException("只有已提交且待审核的资质可以审核。");
      }
      if (message === "QUALIFICATION_REJECTION_REASON_REQUIRED") {
        throw new BadRequestException("退回资质时必须填写原因。");
      }
      throw error;
    }
  }

  @Post("tenants")
  createTenant(@Req() request: RequestWithIdentity, @Body() body: unknown) {
    const current = this.platform(request);
    return { data: this.repo.createTenant((body || {}) as Record<string, unknown>, current.actorId) };
  }

  @Post("tenants/:tenantId/config")
  updateTenant(@Req() request: RequestWithIdentity, @Param("tenantId") tenantId: string, @Body() body: unknown) {
    const current = this.platform(request);
    const data = this.repo.updateTenant(tenantId, (body || {}) as Record<string, unknown>, current.actorId);
    if (!data) throw new NotFoundException("未找到该机构。");
    return { data };
  }

  @Get("support-grants")
  grants(@Req() request: RequestWithIdentity) { this.platform(request); return { data: this.repo.listSupportGrants() }; }

  @Get("audit")
  audit(@Req() request: RequestWithIdentity) { this.platform(request); return { data: this.repo.listAudit() }; }

  @Get("capability-status")
  capabilityStatus(@Req() request: RequestWithIdentity) {
    this.platform(request);
    return { data: [
      { code: "LOCAL_API", label: "本地业务 API", status: "HEALTHY", detail: "当前请求正常" },
      { code: "SQLITE", label: "本地业务数据库", status: "HEALTHY", detail: "演示数据读写正常" },
      { code: "TEST_UPLOAD", label: "本地测试文件适配器", status: "HEALTHY", detail: "当前只承载测试文件" },
      { code: "CLOUD_STORAGE", label: "生产对象存储", status: "PLANNED", detail: "生产部署阶段选型并配置" },
      { code: "ESIGN", label: "电子签章", status: "PLANNED", detail: "取得主体和供应商方案后接入" },
      { code: "MINZHENGTONG", label: "民政通材料协同", status: "PLANNED", detail: "当前采用材料包导出与人工上传" },
      { code: "LTCI", label: "长期护理保险接口", status: "PLANNED", detail: "取得地区接口资格与文档后接入" },
      { code: "SMS", label: "短信服务", status: "PLANNED", detail: "正式账号体系上线前配置" },
    ] };
  }

  @Get("system-status")
  status(@Req() request: RequestWithIdentity) {
    this.platform(request);
    return { data: [
      { code: "LOCAL_API", label: "本地业务 API", status: "HEALTHY", detail: "当前请求正常" },
      { code: "SQLITE", label: "本地业务数据库", status: "HEALTHY", detail: "演示环境数据读写正常" },
      { code: "TEST_UPLOAD", label: "本地文件适配器", status: "HEALTHY", detail: "图片上限 5MB" },
      { code: "CLOUD_STORAGE", label: "生产对象存储", status: "NOT_CONNECTED", detail: "未接入" },
      { code: "ESIGN", label: "电子签章", status: "NOT_CONNECTED", detail: "未接入" },
      { code: "MINZHENGTONG", label: "民政通", status: "NOT_CONNECTED", detail: "未接入" },
      { code: "LTCI", label: "长期护理保险接口", status: "NOT_CONNECTED", detail: "未接入" },
      { code: "SMS", label: "短信服务", status: "NOT_CONNECTED", detail: "未接入" },
    ] };
  }
}
