import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSqliteServiceConfigRepository } from "./local-sqlite-service-config.repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local service workspace configuration", () => {
  it("persists tenant field rules and enabled service items", async () => {
    const directory = mkdtempSync(join(tmpdir(), "care-config-test-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "care.sqlite");
    const first = new LocalSqliteServiceConfigRepository(databasePath);
    const defaults = await first.get("tenant-a");
    await first.update("tenant-a", {
      rules: {
        ...defaults.rules,
        beforeNoteRequired: true,
        evidenceRequired: true,
      },
      enabledServiceItemIds: ["item-room-cleaning", "item-blood-pressure"],
      categories: defaults.categories.map((category, categoryIndex) => ({
        ...category,
        order: categoryIndex,
        items: category.items.map((item, itemIndex) => ({
          ...item,
          order: itemIndex,
        })),
      })).concat([
        {
          id: "custom-category",
          label: "门店自定义服务",
          enabled: true,
          order: defaults.categories.length,
          items: [
            {
              id: "custom-item",
              label: "陪同办理事务",
              enabled: true,
              order: 0,
            },
          ],
        },
      ]),
    });
    first.close();

    const reopened = new LocalSqliteServiceConfigRepository(databasePath);
    const tenantA = await reopened.get("tenant-a");
    const tenantB = await reopened.get("tenant-b");
    reopened.close();

    expect(tenantA.rules.beforeNoteRequired).toBe(true);
    expect(tenantA.rules.evidenceRequired).toBe(true);
    expect(tenantA.enabledServiceItemIds).toEqual([
      "item-room-cleaning",
      "item-blood-pressure",
    ]);
    expect(tenantA.categories.at(-1)).toEqual(
      expect.objectContaining({
        id: "custom-category",
        label: "门店自定义服务",
        items: [expect.objectContaining({ label: "陪同办理事务" })],
      }),
    );
    expect(tenantB.rules.beforeNoteRequired).toBe(false);
  });
});
