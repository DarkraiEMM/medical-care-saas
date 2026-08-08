import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSqliteElderRepository } from "./local-sqlite-elder.repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local SQLite elder repository", () => {
  it("persists an archive across repository restarts and isolates tenants", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-elder-test-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "care.sqlite");

    const firstRepository = new LocalSqliteElderRepository(databasePath);
    const created = await firstRepository.create("tenant-a", {
      displayName: "测试老人",
      primaryContactName: "测试联系人",
      primaryContactPhone: "13800001234",
      serviceMode: "PERIODIC_HOME_VISIT",
      allergies: [],
      medicalHistory: [],
      dietaryRestrictions: [],
      careNotes: "",
    });
    firstRepository.close();

    const reopenedRepository = new LocalSqliteElderRepository(databasePath);
    const tenantARecords = await reopenedRepository.list("tenant-a");
    const tenantBRecords = await reopenedRepository.list("tenant-b");
    reopenedRepository.close();

    expect(created.primaryContactPhoneMasked).toBe("138****1234");
    expect(tenantARecords).toHaveLength(1);
    expect(tenantARecords[0]?.id).toBe(created.id);
    expect(tenantBRecords).toEqual([]);
  });
});
