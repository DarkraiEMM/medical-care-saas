import { createServicePeriodSchema } from "@care/contracts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSqliteElderRepository } from "../elders/local-sqlite-elder.repository.js";
import { LocalSqliteServicePeriodRepository } from "./local-sqlite-service-period.repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local SQLite service period repository", () => {
  it("persists a monthly period across restarts and rejects cross-tenant access", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-period-test-"));
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

    const firstRepository = new LocalSqliteServicePeriodRepository(
      databasePath,
    );
    const created = await firstRepository.create("tenant-a", elder.id, {
      yearMonth: "2026-08",
      serviceMode: "PERIODIC_HOME_VISIT",
      minimumRecordCount: 4,
      selfPaidCents: 1000,
      voucherCents: 5000,
      totalCents: 6000,
    });
    const crossTenant = await firstRepository.create("tenant-b", elder.id, {
      yearMonth: "2026-08",
      serviceMode: "PERIODIC_HOME_VISIT",
      minimumRecordCount: 4,
      selfPaidCents: 0,
      voucherCents: 0,
      totalCents: 0,
    });
    firstRepository.close();

    const reopenedRepository = new LocalSqliteServicePeriodRepository(
      databasePath,
    );
    const records = await reopenedRepository.list("tenant-a", elder.id);
    const hiddenRecords = await reopenedRepository.list("tenant-b", elder.id);
    const duplicate = await reopenedRepository.create("tenant-a", elder.id, {
      yearMonth: "2026-08",
      serviceMode: "PERIODIC_HOME_VISIT",
      minimumRecordCount: 4,
      selfPaidCents: 1000,
      voucherCents: 5000,
      totalCents: 6000,
    });
    reopenedRepository.close();

    expect(created.outcome).toBe("CREATED");
    expect(crossTenant.outcome).toBe("ELDER_NOT_FOUND");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      yearMonth: "2026-08",
      completedRecordCount: 0,
      minimumRecordCount: 4,
      status: "DRAFT",
      totalCents: 6000,
    });
    expect(hiddenRecords).toEqual([]);
    expect(duplicate.outcome).toBe("DUPLICATE");
  });

  it("rejects an amount total that does not match its components", () => {
    const result = createServicePeriodSchema.safeParse({
      yearMonth: "2026-08",
      serviceMode: "DAY_CARE",
      minimumRecordCount: 4,
      selfPaidCents: 1000,
      voucherCents: 5000,
      totalCents: 5000,
    });
    expect(result.success).toBe(false);
  });
});
