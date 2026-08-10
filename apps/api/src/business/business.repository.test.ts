import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OperationsRepository } from "../operations/operations.repository.js";
import { BusinessRepository } from "./business.repository.js";

describe("business repository", () => {
  it("keeps tenant data isolated and records core business changes", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-business-"));
    const repository = new BusinessRepository(
      join(directory, "business.sqlite"),
    );

    const department = repository.createDepartment(
      "tenant-lanzhou-pilot",
      { name: "康复部", leader: "马主管" },
      "tenant-admin-test",
    );
    expect(department?.name).toBe("康复部");
    expect(repository.listDepartments("tenant-second-demo")).toEqual([]);

    const contract = repository.createContract(
      "tenant-lanzhou-pilot",
      { elderName: "周奶奶", fileName: "服务合同扫描件.pdf" },
      "tenant-admin-test",
    );
    expect(contract?.status).toBe("DRAFT");
    const pending = repository.contractAction(
      "tenant-lanzhou-pilot",
      String(contract?.id),
      "REQUEST_SIGN",
      "tenant-admin-test",
    );
    const signed = repository.contractAction(
      "tenant-lanzhou-pilot",
      String(contract?.id),
      "SIGN",
      "tenant-admin-test",
    );
    expect(pending?.status).toBe("PENDING_SIGN");
    expect(signed?.status).toBe("SIGNED");
    repository.close();
  });

  it("requires a reason when a settlement package is returned", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-subsidy-"));
    const repository = new BusinessRepository(
      join(directory, "business.sqlite"),
    );
    expect(() =>
      repository.subsidyAction(
        "tenant-lanzhou-pilot",
        "subsidy-001",
        "RETURN",
        "",
        "tenant-admin-test",
      ),
    ).toThrow("退回时必须填写原因");
    repository.close();
  });

  it("separates responsible and collaborative work in employee performance", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-performance-"));
    const databasePath = join(directory, "business.sqlite");
    const operations = new OperationsRepository(databasePath);
    const business = new BusinessRepository(databasePath);

    const rows = business.listStaffPerformance(
      "tenant-lanzhou-pilot",
      "2026-08",
    );
    const first = rows.find((row) => row.staffId === "staff-lz-001");
    const second = rows.find((row) => row.staffId === "staff-lz-002");

    expect(rows).toHaveLength(3);
    expect(first).toMatchObject({
      assignedTasks: 4,
      approvedTasks: 1,
      responsibleApproved: 1,
      collaborativeApproved: 0,
    });
    expect(second).toMatchObject({
      assignedTasks: 3,
      approvedTasks: 2,
      responsibleApproved: 1,
      collaborativeApproved: 1,
    });
    expect(first?.daily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-08-07", approved: 1 }),
      ]),
    );

    expect(business.listPerformanceTemplates().templates).toHaveLength(3);
    const statements = business.calculatePerformanceStatements(
      "tenant-lanzhou-pilot",
      "2026-08",
      "tenant-admin-test",
    );
    const firstStatement = statements.find(
      (statement) => statement.staffId === "staff-lz-001",
    );
    expect(firstStatement).toMatchObject({
      schemeVersion: 1,
      status: "DRAFT",
      basePoints: 26,
      totalPoints: 26,
    });
    const adjusted = business.adjustPerformanceStatement(
      "tenant-lanzhou-pilot",
      String(firstStatement?.id),
      { points: 5, reason: "客户书面表扬" },
      "tenant-admin-test",
    );
    expect(adjusted).toMatchObject({ adjustmentPoints: 5, totalPoints: 31 });
    business.confirmPerformanceStatement(
      "tenant-lanzhou-pilot",
      String(firstStatement?.id),
      "tenant-admin-test",
    );
    const recalculated = business.calculatePerformanceStatements(
      "tenant-lanzhou-pilot",
      "2026-08",
      "tenant-admin-test",
    );
    expect(
      recalculated.find((statement) => statement.staffId === "staff-lz-001"),
    ).toMatchObject({ status: "CONFIRMED", totalPoints: 31 });
    expect(() =>
      business.adjustPerformanceStatement(
        "tenant-lanzhou-pilot",
        String(firstStatement?.id),
        { points: -1, reason: "不应允许" },
        "tenant-admin-test",
      ),
    ).toThrow("已确认的绩效单不能调整");

    business.close();
    operations.close();
  });

  it("keeps attendance, staff applications and food evidence as separate records", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-staff-apps-"));
    const repository = new BusinessRepository(join(directory, "business.sqlite"));

    expect(repository.getStaffApplications("tenant-lanzhou-pilot", "staff-lz-001")).toMatchObject({
      attendance: { enabled: true },
      foodTrace: { enabled: false },
      customerFeedback: { enabled: true },
    });
    expect(repository.getStaffApplications("tenant-lanzhou-pilot", "staff-lz-003")).toMatchObject({
      attendance: { enabled: false },
      foodTrace: { enabled: true },
      performance: { policyName: "餐饮合规记录积分（演示）" },
    });
    expect(repository.getStaffWorkSummary("tenant-lanzhou-pilot", "staff-lz-003", "2026-08")).toMatchObject({
      policy: {
        name: "餐饮合规记录积分（演示）",
        totalPoints: 5,
        lines: expect.arrayContaining([
          expect.objectContaining({ metricCode: "FOOD_TRACE_VERIFIED", points: 2 }),
          expect.objectContaining({ metricCode: "FOOD_TRACE_DAY", points: 3 }),
        ]),
      },
    });

    const checkedIn = repository.checkAttendance("tenant-lanzhou-pilot", "staff-lz-001", {
      action: "CHECK_IN",
      locationStatus: "SIMULATED",
    });
    expect(checkedIn.record?.checkInAt).toBeTruthy();
    const checkedOut = repository.checkAttendance("tenant-lanzhou-pilot", "staff-lz-001", {
      action: "CHECK_OUT",
      locationStatus: "SIMULATED",
    });
    expect(checkedOut.record?.checkOutAt).toBeTruthy();

    const media = repository.uploadBusinessMedia("tenant-lanzhou-pilot", "staff-lz-003", {
      mediaType: "IMAGE",
      businessType: "FOOD_TRACE",
      businessId: "DRAFT",
      fileName: "批次标签.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4,
      dataUrl: "data:image/jpeg;base64,dGVzdA==",
    });
    const food = repository.createFood("tenant-lanzhou-pilot", {
      ingredient: "白菜",
      quantity: "10千克",
      evidenceIds: [media?.id],
    }, "staff-lz-003");
    expect(food).toMatchObject({ status: "SUBMITTED", evidenceIds: [media?.id] });
    expect(repository.foodAction("tenant-lanzhou-pilot", String(food?.id), "VERIFY", "", "tenant-admin-test"))
      .toMatchObject({ status: "VERIFIED" });
    repository.close();
  });
});
