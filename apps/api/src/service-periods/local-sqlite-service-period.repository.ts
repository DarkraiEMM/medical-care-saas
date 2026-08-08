import type { CreateServicePeriodInput } from "@care/contracts";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateServicePeriodResult,
  ServicePeriodRecord,
  ServicePeriodRepository,
} from "./service-period-repository.js";

interface ServicePeriodRow {
  id: string;
  tenant_id: string;
  elder_id: string;
  year_month: string;
  service_mode: CreateServicePeriodInput["serviceMode"];
  status: ServicePeriodRecord["status"];
  minimum_record_count: number;
  completed_record_count: number;
  self_paid_cents: number;
  voucher_cents: number;
  total_cents: number;
  created_at: string;
}

export class LocalSqliteServicePeriodRepository implements ServicePeriodRepository {
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
  }

  async list(
    tenantId: string,
    elderId: string,
  ): Promise<ServicePeriodRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT id, tenant_id, elder_id, year_month, service_mode, status,
                minimum_record_count, completed_record_count, self_paid_cents,
                voucher_cents, total_cents, created_at
           FROM service_periods
          WHERE tenant_id = ? AND elder_id = ?
          ORDER BY year_month DESC, created_at DESC`,
      )
      .all(tenantId, elderId) as unknown as ServicePeriodRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    tenantId: string,
    elderId: string,
    input: CreateServicePeriodInput,
  ): Promise<CreateServicePeriodResult> {
    const elder = this.database
      .prepare("SELECT id FROM elder_archives WHERE tenant_id = ? AND id = ?")
      .get(tenantId, elderId);
    if (!elder) return { outcome: "ELDER_NOT_FOUND" };

    const duplicate = this.database
      .prepare(
        `SELECT id FROM service_periods
          WHERE tenant_id = ? AND elder_id = ? AND year_month = ? AND service_mode = ?`,
      )
      .get(tenantId, elderId, input.yearMonth, input.serviceMode);
    if (duplicate) return { outcome: "DUPLICATE" };

    const record: ServicePeriodRecord = {
      id: randomUUID(),
      tenantId,
      elderId,
      yearMonth: input.yearMonth,
      serviceMode: input.serviceMode,
      status: "DRAFT",
      minimumRecordCount: input.minimumRecordCount,
      completedRecordCount: 0,
      selfPaidCents: input.selfPaidCents,
      voucherCents: input.voucherCents,
      totalCents: input.totalCents,
      createdAt: new Date().toISOString(),
    };

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO service_periods (
             id, tenant_id, elder_id, year_month, service_mode, status,
             minimum_record_count, completed_record_count, self_paid_cents,
             voucher_cents, total_cents, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.tenantId,
          record.elderId,
          record.yearMonth,
          record.serviceMode,
          record.status,
          record.minimumRecordCount,
          record.completedRecordCount,
          record.selfPaidCents,
          record.voucherCents,
          record.totalCents,
          record.createdAt,
        );
      this.database
        .prepare(
          `UPDATE elder_archives
              SET completed_records = 0, minimum_records = ?, status = 'IN_SERVICE'
            WHERE tenant_id = ? AND id = ?`,
        )
        .run(record.minimumRecordCount, tenantId, elderId);
      this.database.exec("COMMIT");
      return { outcome: "CREATED", record };
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
      CREATE TABLE IF NOT EXISTS service_periods (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        elder_id TEXT NOT NULL,
        year_month TEXT NOT NULL,
        service_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        minimum_record_count INTEGER NOT NULL DEFAULT 4,
        completed_record_count INTEGER NOT NULL DEFAULT 0,
        self_paid_cents INTEGER NOT NULL DEFAULT 0,
        voucher_cents INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, elder_id, year_month, service_mode),
        FOREIGN KEY (elder_id) REFERENCES elder_archives(id)
      );
      CREATE INDEX IF NOT EXISTS idx_service_periods_tenant_elder_month
        ON service_periods (tenant_id, elder_id, year_month DESC);
    `);
  }

  private mapRow(row: ServicePeriodRow): ServicePeriodRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      elderId: row.elder_id,
      yearMonth: row.year_month,
      serviceMode: row.service_mode,
      status: row.status,
      minimumRecordCount: row.minimum_record_count,
      completedRecordCount: row.completed_record_count,
      selfPaidCents: row.self_paid_cents,
      voucherCents: row.voucher_cents,
      totalCents: row.total_cents,
      createdAt: row.created_at,
    };
  }
}
