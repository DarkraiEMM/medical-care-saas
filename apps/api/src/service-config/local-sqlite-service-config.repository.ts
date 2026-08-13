import type { UpdateServiceWorkspaceConfigInput } from "@care/contracts";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ServiceConfigRepository,
  ServiceWorkspaceConfig,
} from "./service-config-repository.js";

const categories: ServiceWorkspaceConfig["categories"] = [
  {
    id: "daily-living",
    label: "生活照料",
    items: [
      { id: "item-room-cleaning", label: "助洁 · 居室清洁", enabled: true, order: 0 },
      { id: "item-laundry", label: "助洁 · 衣物洗涤", enabled: true, order: 1 },
      { id: "item-home-cooking", label: "助餐 · 上门做饭", enabled: true, order: 2 },
      { id: "item-walking-company", label: "助行 · 陪同散步", enabled: true, order: 3 },
    ],
    enabled: true,
    order: 0,
  },
  {
    id: "health-management",
    label: "健康管理",
    items: [
      { id: "item-blood-pressure", label: "常规指标 · 测血压", enabled: true, order: 0 },
      { id: "item-blood-glucose", label: "常规指标 · 测血糖", enabled: true, order: 1 },
      { id: "item-heart-rate", label: "常规指标 · 测心率", enabled: true, order: 2 },
      { id: "item-temperature", label: "常规指标 · 测体温", enabled: true, order: 3 },
    ],
    enabled: true,
    order: 1,
  },
  {
    id: "basic-care",
    label: "基础照护",
    items: [
      { id: "item-position-change", label: "护理协助 · 翻身及体位变换", enabled: true, order: 0 },
      { id: "item-pressure-care", label: "护理协助 · 压疮预防护理", enabled: true, order: 1 },
      { id: "item-medication-reminder", label: "护理协助 · 用药提醒", enabled: true, order: 2 },
    ],
    enabled: true,
    order: 2,
  },
  {
    id: "companionship",
    label: "探访关爱",
    enabled: true,
    order: 3,
    items: [
      { id: "item-regular-visit", label: "定期上门探访", enabled: true, order: 0 },
      { id: "item-chat-company", label: "聊天陪伴", enabled: true, order: 1 },
      { id: "item-emotional-support", label: "情绪疏导", enabled: true, order: 2 },
      { id: "item-holiday-care", label: "节日关怀", enabled: true, order: 3 },
    ],
  },
];

const staff: ServiceWorkspaceConfig["staff"] = [
  { id: "staff-lz-001", displayName: "刘阿姨", department: "护理部" },
  { id: "staff-lz-002", displayName: "赵阿姨", department: "服务部" },
  { id: "staff-lz-003", displayName: "陈师傅", department: "餐饮部" },
];

const defaultInput: UpdateServiceWorkspaceConfigInput = {
  rules: {
    beforeNoteRequired: false,
    duringNoteRequired: false,
    afterNoteRequired: false,
    resultSummaryRequired: false,
    evidenceEnabled: true,
    evidenceRequired: false,
  },
  enabledServiceItemIds: categories.flatMap((category) =>
    category.items.map((item) => item.id),
  ),
  categories,
};

export class LocalSqliteServiceConfigRepository implements ServiceConfigRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath = process.env.LOCAL_SQLITE_PATH?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LOCAL_SQLITE_FORBIDDEN_IN_PRODUCTION");
    }
    const resolvedPath = resolve(databasePath || ".local-data/care-dev.sqlite");
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS service_workspace_configs (
        tenant_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  async get(tenantId: string): Promise<ServiceWorkspaceConfig> {
    const row = this.database
      .prepare(
        "SELECT config_json FROM service_workspace_configs WHERE tenant_id = ?",
      )
      .get(tenantId) as { config_json: string } | undefined;
    const input = row
      ? (JSON.parse(row.config_json) as UpdateServiceWorkspaceConfigInput)
      : defaultInput;
    return {
      ...input,
      categories: input.categories?.length ? input.categories : categories,
      staff,
    };
  }

  async update(
    tenantId: string,
    input: UpdateServiceWorkspaceConfigInput,
  ): Promise<ServiceWorkspaceConfig> {
    this.database
      .prepare(
        `INSERT INTO service_workspace_configs (tenant_id, config_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`,
      )
      .run(tenantId, JSON.stringify(input), new Date().toISOString());
    return {
      ...input,
      categories: input.categories?.length ? input.categories : categories,
      staff,
    };
  }

  close(): void {
    this.database.close();
  }
}
