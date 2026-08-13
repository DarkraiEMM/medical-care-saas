import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OperationsRepository } from "./operations.repository.js";
import { LocalSqliteServiceFormRepository } from "../service-form/local-sqlite-service-form.repository.js";
import { BusinessRepository } from "../business/business.repository.js";

describe("operations repository", () => {
  it("links staff stages, organization review and version history", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-operations-"));
    const repository = new OperationsRepository(join(directory, "test.sqlite"));

    expect(repository.listTenants()).toHaveLength(4);
    for (const stage of ["BEFORE", "DURING", "AFTER"] as const) {
      repository.saveStage(
        "tenant-lanzhou-pilot",
        "task-lz-001",
        stage,
        {
          note: `${stage} 阶段记录`,
          locationStatus: "SIMULATED",
          evidence: [],
          answers:
            stage === "AFTER"
              ? { "preset-result-default": "本次服务已按计划完成。" }
              : {},
        },
        "staff-lz-001",
      );
    }

    const submitted = repository.submitTask(
      "tenant-lanzhou-pilot",
      "task-lz-001",
      "staff-lz-001",
    ) as { status: string };
    expect(submitted.status).toBe("PENDING_REVIEW");

    const returned = repository.reviewTask(
      "tenant-lanzhou-pilot",
      "task-lz-001",
      "RETURN",
      [{
        stage: "AFTER",
        fieldId: "preset-result-default",
        fieldLabel: "服务结果总结",
        reason: "请补充服务完成情况。",
        resolved: false,
      }],
      "tenant-admin-test",
    ) as { status: string; revision: number; history: unknown[]; returnIssues: Array<{ fieldLabel: string; resolved: boolean }> };
    expect(returned.status).toBe("RETURNED");
    expect(returned.revision).toBe(2);
    expect(returned.history).toHaveLength(1);
    expect(returned.returnIssues).toEqual([
      expect.objectContaining({ fieldLabel: "服务结果总结", resolved: false }),
    ]);
    const modified = repository.saveStage(
      "tenant-lanzhou-pilot",
      "task-lz-001",
      "AFTER",
      {
        note: "修改后的服务后记录",
        locationStatus: "SIMULATED",
        evidence: [],
        answers: { "preset-result-default": "本次服务已完成。" },
      },
      "staff-lz-001",
    ) as { returnIssues: Array<{ resolved: boolean }> };
    expect(modified.returnIssues[0]?.resolved).toBe(true);
    repository.submitTask(
      "tenant-lanzhou-pilot",
      "task-lz-001",
      "staff-lz-001",
    );
    repository.reviewTask(
      "tenant-lanzhou-pilot",
      "task-lz-001",
      "APPROVE",
      "",
      "tenant-admin-test",
    );
    expect(() =>
      repository.saveStage(
        "tenant-lanzhou-pilot",
        "task-lz-001",
        "AFTER",
        { note: "不应覆盖审核后的记录", locationStatus: "SIMULATED", evidence: [] },
        "staff-lz-001",
      ),
    ).toThrow("TASK_NOT_EDITABLE");
    expect(() =>
      repository.submitTask(
        "tenant-lanzhou-pilot",
        "task-lz-001",
        "staff-lz-001",
      ),
    ).toThrow("TASK_NOT_EDITABLE");
    repository.close();
  });

  it("keeps the responsible person separate from collaborators", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-task-people-"));
    const repository = new OperationsRepository(join(directory, "test.sqlite"));
    const task = repository.createTask(
      "tenant-lanzhou-pilot",
      {
        elderName: "测试老人",
        archiveNo: "TEST-001",
        scheduledAt: "2026-08-10T09:00:00+08:00",
        serviceItems: ["探访关爱·聊天陪伴"],
        responsibleId: "staff-lz-001",
        participantIds: ["staff-lz-002"],
      },
      "tenant-admin-test",
    ) as { responsibleId: string; participantIds: string[]; templateSnapshot: { version: number } };
    expect(task.responsibleId).toBe("staff-lz-001");
    expect(task.participantIds).toEqual(["staff-lz-002"]);
    expect(task.templateSnapshot.version).toBe(1);
    expect(() => repository.createTask(
      "tenant-lanzhou-pilot",
      {
        elderName: "测试老人",
        archiveNo: "TEST-002",
        scheduledAt: "2026-08-10T10:00:00+08:00",
        serviceItems: ["探访关爱·聊天陪伴"],
        responsibleId: "staff-lz-001",
        participantIds: ["staff-lz-001"],
      },
      "tenant-admin-test",
    )).toThrow("RESPONSIBLE_DUPLICATED");
    repository.close();
  });

  it("blocks a suspended tenant and restores access after reactivation", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-tenant-state-"));
    const repository = new OperationsRepository(join(directory, "test.sqlite"));
    repository.updateTenant(
      "tenant-lanzhou-pilot",
      { status: "SUSPENDED" },
      "platform-test",
    );
    expect(() => repository.listTasks("tenant-lanzhou-pilot")).toThrow(
      "TENANT_SUSPENDED",
    );
    repository.updateTenant(
      "tenant-lanzhou-pilot",
      { status: "ACTIVE" },
      "platform-test",
    );
    expect(repository.listTasks("tenant-lanzhou-pilot")).toHaveLength(6);
    repository.close();
  });

  it("assigns monthly subscription plans to tenants", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-subscription-"));
    const repository = new OperationsRepository(join(directory, "test.sqlite"));
    expect(repository.listSubscriptionPlans()).toHaveLength(4);
    const before = repository.getTenant("tenant-lanzhou-pilot") as {
      subscription: { planCode: string; monthlyPriceCents: number };
    };
    expect(before.subscription).toMatchObject({
      planCode: "STANDARD",
      monthlyPriceCents: 32800,
    });
    const after = repository.updateTenant(
      "tenant-lanzhou-pilot",
      { planCode: "STARTER" },
      "platform-test",
    ) as { subscription: { planCode: string; monthlyPriceCents: number } };
    expect(after.subscription).toMatchObject({
      planCode: "STARTER",
      monthlyPriceCents: 12800,
    });
    repository.close();
  });

  it("keeps qualification submission with the institution and review with the platform", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-qualification-"));
    const databasePath = join(directory, "test.sqlite");
    const formRepository = new LocalSqliteServiceFormRepository(databasePath);
    await formRepository.get("tenant-lanzhou-pilot");
    await formRepository.uploadQualification(
      "tenant-lanzhou-pilot",
      "HEALTH_SERVICE_OPERATION",
      "健康服务资质演示件.pdf",
    );
    const submitted = await formRepository.submitQualification(
      "tenant-lanzhou-pilot",
      "HEALTH_SERVICE_OPERATION",
    );
    expect(submitted?.qualifications.find((item) => item.code === "HEALTH_SERVICE_OPERATION")?.status).toBe("PENDING");

    const repository = new OperationsRepository(databasePath);
    const professionalTask = {
      elderName: "演示服务对象",
      archiveNo: "DEMO-QUAL-001",
      scheduledAt: "2026-08-10T09:00:00+08:00",
      serviceItems: ["健康服务·推拿"],
      responsibleId: "staff-lz-001",
      participantIds: [],
    };
    expect(() => repository.createTask(
      "tenant-lanzhou-pilot",
      professionalTask,
      "tenant-admin-test",
    )).toThrow("SERVICE_QUALIFICATION_REQUIRED:HEALTH_SERVICE_OPERATION");
    const reviewed = repository.reviewQualification(
      "tenant-lanzhou-pilot",
      "HEALTH_SERVICE_OPERATION",
      { action: "APPROVE", validUntil: "2027-12-31" },
      "platform-test",
    ) as { status: string; reviewedBy: string };
    expect(reviewed).toMatchObject({ status: "APPROVED", reviewedBy: "platform-test" });
    expect(repository.createTask(
      "tenant-lanzhou-pilot",
      professionalTask,
      "tenant-admin-test",
    )).toMatchObject({ status: "NOT_STARTED" });
    expect(() => repository.reviewQualification(
      "tenant-lanzhou-pilot",
      "HEALTH_SERVICE_OPERATION",
      { action: "REJECT", reason: "重复审核" },
      "platform-test",
    )).toThrow("QUALIFICATION_NOT_REVIEWABLE");
    repository.close();
    formRepository.close();
  });

  it("stores the configurable customer feedback separately from service stages", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-feedback-"));
    const databasePath = join(directory, "test.sqlite");
    const formRepository = new LocalSqliteServiceFormRepository(databasePath);
    await formRepository.get("tenant-lanzhou-pilot");
    const businessRepository = new BusinessRepository(databasePath);
    const repository = new OperationsRepository(databasePath);
    const context = repository.getCustomerFeedback("tenant-lanzhou-pilot", "task-lz-001", "staff-lz-001") as { enabled: boolean };
    expect(context.enabled).toBe(true);
    const saved = repository.saveCustomerFeedback("tenant-lanzhou-pilot", "task-lz-001", {
      evaluatorType: "ELDER",
      satisfaction: "SATISFIED",
      tags: ["态度亲切", "准时到达"],
      text: "服务细致。",
      mediaIds: [],
    }, "staff-lz-001") as { feedback: { satisfaction: string; tags: string[] } };
    expect(saved.feedback).toMatchObject({ satisfaction: "SATISFIED", tags: ["态度亲切", "准时到达"] });
    const task = repository.getTask("tenant-lanzhou-pilot", "task-lz-001") as { customerFeedback: { text: string } };
    expect(task.customerFeedback.text).toBe("服务细致。");
    businessRepository.saveSettings("tenant-lanzhou-pilot", {
      organizationName: "兰州试点机构",
      locationRadiusMeters: 300,
      timeToleranceMinutes: 30,
      evidenceRetentionYears: 3,
      attendanceEnabled: true,
      foodTraceEnabled: true,
      customerFeedbackEnabled: false,
    }, "tenant-admin-test");
    expect((repository.getCustomerFeedback("tenant-lanzhou-pilot", "task-lz-001") as { enabled: boolean }).enabled).toBe(false);
    expect(() => repository.saveCustomerFeedback("tenant-lanzhou-pilot", "task-lz-001", {}, "staff-lz-001"))
      .toThrow("CUSTOMER_FEEDBACK_DISABLED");
    repository.close();
    businessRepository.close();
    formRepository.close();
  });
});
