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
    expect(
      repository.contractAction(
        "tenant-lanzhou-pilot",
        String(contract?.id),
        "REQUEST_SIGN",
        "tenant-admin-test",
      )?.status,
    ).toBe("PENDING_SIGN");
    expect(
      repository.contractAction(
        "tenant-lanzhou-pilot",
        String(contract?.id),
        "SIGN",
        "tenant-admin-test",
      )?.status,
    ).toBe("SIGNED");
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
    ).toThrow();
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

    const statements = business.calculatePerformanceStatements(
      "tenant-lanzhou-pilot",
      "2026-08",
      "tenant-admin-test",
    );
    const firstStatement = statements.find(
      (statement) => statement.staffId === "staff-lz-001",
    );
    expect(firstStatement).toMatchObject({
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
    expect(
      business
        .calculatePerformanceStatements(
          "tenant-lanzhou-pilot",
          "2026-08",
          "tenant-admin-test",
        )
        .find((statement) => statement.staffId === "staff-lz-001"),
    ).toMatchObject({ status: "CONFIRMED", totalPoints: 31 });

    business.close();
    operations.close();
  });

  it("closes department configuration, employee submission, review and performance confirmation", () => {
    const directory = mkdtempSync(join(tmpdir(), "care-closure-"));
    const databasePath = join(directory, "business.sqlite");
    const operations = new OperationsRepository(databasePath);
    const repository = new BusinessRepository(databasePath);

    const policies = repository.listDepartmentAppPolicies(
      "tenant-lanzhou-pilot",
    );
    expect(policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          departmentName: "护理部",
          attendanceEnabled: true,
        }),
        expect.objectContaining({
          departmentName: "餐饮部",
          foodTraceEnabled: true,
        }),
      ]),
    );
    expect(
      repository.getStaffApplications("tenant-lanzhou-pilot", "staff-lz-001"),
    ).toMatchObject({
      attendance: { enabled: true },
      foodTrace: { enabled: false },
      customerFeedback: { enabled: true },
    });
    expect(
      repository.getStaffApplications("tenant-lanzhou-pilot", "staff-lz-003"),
    ).toMatchObject({
      attendance: { enabled: false },
      foodTrace: { enabled: true },
    });

    const media = repository.uploadBusinessMedia(
      "tenant-lanzhou-pilot",
      "staff-lz-003",
      {
        mediaType: "IMAGE",
        businessType: "FOOD_TRACE",
        businessId: "DRAFT",
        fileName: "批次标签.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 4,
        dataUrl: "data:image/jpeg;base64,dGVzdA==",
      },
    );
    const submitted = repository.createFood(
      "tenant-lanzhou-pilot",
      {
        serviceDate: "2026-08-10",
        ingredient: "白菜",
        quantity: "10千克",
        evidenceIds: [media?.id],
      },
      "staff-lz-003",
    );
    const returned = repository.foodAction(
      "tenant-lanzhou-pilot",
      String(submitted?.id),
      "RETURN",
      "请补充供应商名称和票据照片",
      "tenant-admin-test",
    );
    expect(returned).toMatchObject({ status: "RETURNED" });
    expect(
      repository
        .listFood("tenant-lanzhou-pilot", "staff-lz-003")
        .find((item) => item.id === submitted?.id),
    ).toMatchObject({
      status: "RETURNED",
      history: expect.arrayContaining([
        expect.objectContaining({ action: "RETURN" }),
      ]),
    });

    const resubmitted = repository.resubmitFood(
      "tenant-lanzhou-pilot",
      String(submitted?.id),
      {
        serviceDate: "2026-08-10",
        ingredient: "白菜",
        supplier: "兰州安心农产品配送中心",
        batchNo: "PC-20260810-01",
        quantity: "10千克",
        evidenceIds: [media?.id],
      },
      "staff-lz-003",
    );
    expect(resubmitted).toMatchObject({
      id: submitted?.id,
      status: "SUBMITTED",
      returnReason: "",
    });
    const verified = repository.foodAction(
      "tenant-lanzhou-pilot",
      String(submitted?.id),
      "VERIFY",
      "",
      "tenant-admin-test",
    );
    expect(verified).toMatchObject({ status: "VERIFIED" });
    expect(verified?.history.map((entry) => entry.action)).toEqual([
      "SUBMIT",
      "RETURN",
      "RESUBMIT",
      "VERIFY",
    ]);

    const statements = repository.calculatePerformanceStatements(
      "tenant-lanzhou-pilot",
      "2026-08",
      "tenant-admin-test",
    );
    const foodStatement = statements.find(
      (statement) => statement.staffId === "staff-lz-003",
    );
    expect(foodStatement?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricCode: "FOOD_TRACE_VERIFIED",
          units: 2,
          points: 4,
        }),
        expect.objectContaining({
          metricCode: "FOOD_TRACE_DAY",
          units: 2,
          points: 6,
        }),
      ]),
    );
    repository.confirmPerformanceStatement(
      "tenant-lanzhou-pilot",
      String(foodStatement?.id),
      "tenant-admin-test",
    );
    expect(
      repository.getStaffWorkSummary(
        "tenant-lanzhou-pilot",
        "staff-lz-003",
        "2026-08",
      ).statement,
    ).toMatchObject({ status: "CONFIRMED", totalPoints: 10 });

    repository.close();
    operations.close();
  });
});
