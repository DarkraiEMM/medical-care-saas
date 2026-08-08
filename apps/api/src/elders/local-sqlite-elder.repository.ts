import type { CreateElderInput } from "@care/contracts";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ElderArchiveRecord,
  ElderRepository,
} from "./elder-repository.js";

interface ElderRow {
  id: string;
  tenant_id: string;
  archive_no: string;
  display_name: string;
  primary_contact_name: string;
  primary_contact_phone_masked: string;
  service_mode: CreateElderInput["serviceMode"];
  completed_records: number;
  minimum_records: number;
  status: ElderArchiveRecord["status"];
  created_at: string;
}

const seedRows: Array<Omit<ElderArchiveRecord, "tenantId">> = [
  {
    id: "elder-lz-001",
    archiveNo: "DEMO-2026-001",
    displayName: "张奶奶（模拟）",
    primaryContactName: "张女士（模拟）",
    primaryContactPhoneMasked: "138****1208",
    serviceMode: "PERIODIC_HOME_VISIT",
    completedRecords: 2,
    minimumRecords: 4,
    status: "IN_SERVICE",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "elder-lz-002",
    archiveNo: "DEMO-2026-002",
    displayName: "李爷爷（模拟）",
    primaryContactName: "李先生（模拟）",
    primaryContactPhoneMasked: "139****3306",
    serviceMode: "DAY_CARE",
    completedRecords: 4,
    minimumRecords: 4,
    status: "READY_FOR_REVIEW",
    createdAt: "2026-08-02T09:00:00.000Z",
  },
  {
    id: "elder-lz-003",
    archiveNo: "DEMO-2026-003",
    displayName: "王奶奶（模拟）",
    primaryContactName: "王女士（模拟）",
    primaryContactPhoneMasked: "136****7811",
    serviceMode: "APPOINTMENT_HOME_VISIT",
    completedRecords: 4,
    minimumRecords: 4,
    status: "RETURNED",
    createdAt: "2026-08-03T09:00:00.000Z",
  },
];

export class LocalSqliteElderRepository implements ElderRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath = process.env.LOCAL_SQLITE_PATH?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LOCAL_SQLITE_FORBIDDEN_IN_PRODUCTION");
    }

    const resolvedPath = resolve(databasePath || ".local-data/care-dev.sqlite");
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.initializeSchema();
    this.seedTenant("tenant-lanzhou-pilot");
  }

  async list(tenantId: string): Promise<ElderArchiveRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT id, tenant_id, archive_no, display_name, primary_contact_name,
                primary_contact_phone_masked, service_mode, completed_records,
                minimum_records, status, created_at
           FROM elder_archives
          WHERE tenant_id = ?
          ORDER BY created_at DESC`,
      )
      .all(tenantId) as unknown as ElderRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    tenantId: string,
    input: CreateElderInput,
  ): Promise<ElderArchiveRecord> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO tenant_archive_sequences (tenant_id, next_value)
           VALUES (?, 1)
           ON CONFLICT(tenant_id) DO NOTHING`,
        )
        .run(tenantId);
      const sequenceRow = this.database
        .prepare(
          "SELECT next_value FROM tenant_archive_sequences WHERE tenant_id = ?",
        )
        .get(tenantId) as { next_value: number };
      this.database
        .prepare(
          "UPDATE tenant_archive_sequences SET next_value = next_value + 1 WHERE tenant_id = ?",
        )
        .run(tenantId);

      const now = new Date().toISOString();
      const record: ElderArchiveRecord = {
        id: randomUUID(),
        tenantId,
        archiveNo: `DEMO-${new Date().getUTCFullYear()}-${String(sequenceRow.next_value).padStart(3, "0")}`,
        displayName: input.displayName.includes("模拟")
          ? input.displayName
          : `${input.displayName}（模拟）`,
        primaryContactName: input.primaryContactName,
        primaryContactPhoneMasked: this.maskPhone(input.primaryContactPhone),
        serviceMode: input.serviceMode,
        completedRecords: 0,
        minimumRecords: 4,
        status: "PENDING_PERIOD",
        createdAt: now,
      };

      this.database
        .prepare(
          `INSERT INTO elder_archives (
             id, tenant_id, archive_no, display_name, primary_contact_name,
             primary_contact_phone_masked, service_mode, completed_records,
             minimum_records, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.tenantId,
          record.archiveNo,
          record.displayName,
          record.primaryContactName,
          record.primaryContactPhoneMasked,
          record.serviceMode,
          record.completedRecords,
          record.minimumRecords,
          record.status,
          record.createdAt,
        );
      this.database.exec("COMMIT");
      return record;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private initializeSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS elder_archives (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        archive_no TEXT NOT NULL,
        display_name TEXT NOT NULL,
        primary_contact_name TEXT NOT NULL,
        primary_contact_phone_masked TEXT NOT NULL,
        service_mode TEXT NOT NULL,
        completed_records INTEGER NOT NULL DEFAULT 0,
        minimum_records INTEGER NOT NULL DEFAULT 4,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, archive_no)
      );
      CREATE INDEX IF NOT EXISTS idx_elder_archives_tenant_created
        ON elder_archives (tenant_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS tenant_archive_sequences (
        tenant_id TEXT PRIMARY KEY,
        next_value INTEGER NOT NULL
      );
    `);
  }

  private seedTenant(tenantId: string): void {
    const existing = this.database
      .prepare(
        "SELECT COUNT(*) AS total FROM elder_archives WHERE tenant_id = ?",
      )
      .get(tenantId) as { total: number };
    if (existing.total > 0) return;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.database.prepare(
        `INSERT INTO elder_archives (
           id, tenant_id, archive_no, display_name, primary_contact_name,
           primary_contact_phone_masked, service_mode, completed_records,
           minimum_records, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of seedRows) {
        insert.run(
          row.id,
          tenantId,
          row.archiveNo,
          row.displayName,
          row.primaryContactName,
          row.primaryContactPhoneMasked,
          row.serviceMode,
          row.completedRecords,
          row.minimumRecords,
          row.status,
          row.createdAt,
        );
      }
      this.database
        .prepare(
          `INSERT INTO tenant_archive_sequences (tenant_id, next_value)
           VALUES (?, ?)
           ON CONFLICT(tenant_id) DO UPDATE SET next_value = excluded.next_value`,
        )
        .run(tenantId, seedRows.length + 1);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private mapRow(row: ElderRow): ElderArchiveRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      archiveNo: row.archive_no,
      displayName: row.display_name,
      primaryContactName: row.primary_contact_name,
      primaryContactPhoneMasked: row.primary_contact_phone_masked,
      serviceMode: row.service_mode,
      completedRecords: row.completed_records,
      minimumRecords: row.minimum_records,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private maskPhone(phone: string): string {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
