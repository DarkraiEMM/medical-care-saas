import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSqliteElderRepository } from "../elders/local-sqlite-elder.repository.js";
import { LocalSqliteServicePeriodRepository } from "../service-periods/local-sqlite-service-period.repository.js";
import { LocalSqliteServiceRecordRepository } from "./local-sqlite-service-record.repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local SQLite service record repository", () => {
  it("persists a dated three-stage record and updates period progress", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-record-test-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "care.sqlite");
    const elderRepository = new LocalSqliteElderRepository(databasePath);
    const elder = await elderRepository.create("tenant-a", {
      displayName: "测试老人",
      primaryContactName: "测试联系人",
      primaryContactPhone: "13800001234",
      serviceMode: "PERIODIC_HOME_VISIT",
      allergies: [],
      medicalHistory: [],
      dietaryRestrictions: [],
      careNotes: "",
    });
    elderRepository.close();
    const periodRepository = new LocalSqliteServicePeriodRepository(
      databasePath,
    );
    const periodResult = await periodRepository.create("tenant-a", elder.id, {
      yearMonth: "2026-08",
      serviceMode: "PERIODIC_HOME_VISIT",
      minimumRecordCount: 4,
      selfPaidCents: 0,
      voucherCents: 60000,
      totalCents: 60000,
    });
    periodRepository.close();
    if (periodResult.outcome !== "CREATED")
      throw new Error("PERIOD_NOT_CREATED");

    const firstRepository = new LocalSqliteServiceRecordRepository(
      databasePath,
    );
    const created = await firstRepository.create("tenant-a", {
      periodId: periodResult.record.id,
      occurredAt: "2026-08-08T09:00:00.000Z",
      startedAt: "2026-08-08T09:00:00.000Z",
      endedAt: "2026-08-08T10:00:00.000Z",
      participantIds: ["staff-lz-001"],
      serviceItemVersionIds: ["item-room-cleaning"],
      log: "完成居室清洁并检查现场安全。",
      stages: ["BEFORE", "DURING", "AFTER"],
      stageNotes: {
        BEFORE: "确认环境和服务内容",
        DURING: "完成居室清洁服务",
        AFTER: "检查结果并由老人确认",
      },
      vitalSigns: [],
    });
    const outside = await firstRepository.create("tenant-a", {
      periodId: periodResult.record.id,
      occurredAt: "2026-09-01T09:00:00.000Z",
      startedAt: "2026-09-01T09:00:00.000Z",
      endedAt: "2026-09-01T10:00:00.000Z",
      participantIds: ["staff-lz-001"],
      serviceItemVersionIds: ["item-room-cleaning"],
      log: "这条记录的日期不属于当前核销月份。",
      stages: ["BEFORE", "DURING", "AFTER"],
      stageNotes: { BEFORE: "准备", DURING: "服务", AFTER: "完成" },
      vitalSigns: [],
    });
    firstRepository.close();

    const reopened = new LocalSqliteServiceRecordRepository(databasePath);
    const records = await reopened.list("tenant-a", periodResult.record.id);
    reopened.close();
    const checkPeriods = new LocalSqliteServicePeriodRepository(databasePath);
    const periods = await checkPeriods.list("tenant-a", elder.id);
    checkPeriods.close();

    expect(created.outcome).toBe("CREATED");
    expect(outside.outcome).toBe("DATE_OUTSIDE_PERIOD");
    expect(records).toHaveLength(1);
    expect(records[0]?.stageNotes.DURING).toBe("完成居室清洁服务");
    expect(periods[0]?.completedRecordCount).toBe(1);
    expect(periods[0]?.status).toBe("IN_SERVICE");
  });
});
