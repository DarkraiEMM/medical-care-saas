import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSqliteServiceFormRepository } from "./local-sqlite-service-form.repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local service form repository", () => {
  it("keeps selected health indicators in one configurable field group", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-form-group-test-"));
    temporaryDirectories.push(directory);
    const repository = new LocalSqliteServiceFormRepository(
      join(directory, "care.sqlite"),
    );
    const workspace = await repository.get("tenant-group");
    const selected = workspace.presetFields
      .filter((field) =>
        ["SYSTOLIC_PRESSURE", "DIASTOLIC_PRESSURE", "TEMPERATURE"].includes(
          field.presetCode ?? "",
        ),
      )
      .map((field, order) => ({
        ...field,
        id: `selected-vital-${order}`,
        order,
        required: field.presetCode !== "TEMPERATURE",
      }));

    expect(selected).toHaveLength(3);
    expect(selected.every((field) => field.groupCode === "VITAL_SIGNS")).toBe(
      true,
    );
    expect(selected.every((field) => field.groupLabel === "健康指标")).toBe(
      true,
    );
    expect(selected.every((field) => field.evidenceStage === "DURING")).toBe(
      true,
    );

    await repository.saveDraft("tenant-group", {
      ...workspace.draftTemplate,
      fields: selected,
    });
    const published = await repository.publish("tenant-group");
    expect(published.outcome).toBe("PUBLISHED");
    if (published.outcome === "PUBLISHED") {
      expect(published.workspace.publishedTemplate.fields).toMatchObject([
        { label: "收缩压", required: true, groupLabel: "健康指标" },
        { label: "舒张压", required: true, groupLabel: "健康指标" },
        { label: "体温", required: false, groupLabel: "健康指标" },
      ]);
    }
    repository.close();
  });

  it("persists tenant custom fields and enforces qualification status", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-form-test-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "care.sqlite");
    const repository = new LocalSqliteServiceFormRepository(databasePath);
    const workspace = await repository.get("tenant-a");
    const restricted = workspace.presetFields.find(
      (field) => field.presetCode === "HEALTH_SERVICE",
    );
    if (!restricted) throw new Error("MISSING_PRESET");
    await repository.saveDraft("tenant-a", {
      ...workspace.draftTemplate,
      fields: [
        {
          ...restricted,
          id: "tenant-a-health-field",
          order: 0,
          required: true,
        },
      ],
    });
    await repository.simulateQualification(
      "tenant-a",
      "HEALTH_SERVICE_OPERATION",
      "EXPIRED",
    );
    const blocked = await repository.publish("tenant-a");
    expect(blocked.outcome).toBe("QUALIFICATION_REQUIRED");

    await repository.simulateQualification(
      "tenant-a",
      "HEALTH_SERVICE_OPERATION",
      "APPROVED",
    );
    const published = await repository.publish("tenant-a");
    expect(published.outcome).toBe("PUBLISHED");
    if (published.outcome === "PUBLISHED") {
      expect(published.workspace.publishedTemplate.fields[0]?.label).toBe(
        "健康服务",
      );
    }
    repository.close();
  });
});
