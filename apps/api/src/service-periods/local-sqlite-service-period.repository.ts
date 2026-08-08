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
  revision_no: number;
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
    this.seedPilotPeriods();
    const rows = this.database
      .prepare(
        `SELECT id, tenant_id, elder_id, year_month, service_mode, revision_no, status,
                minimum_record_count, completed_record_count, self_paid_cents,
                voucher_cents, total_cents, created_at
           FROM service_periods
          WHERE tenant_id = ? AND elder_id = ?
          ORDER BY year_month DESC, revision_no DESC, created_at DESC`,
      )
      .all(tenantId, elderId) as unknown as ServicePeriodRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    tenantId: string,
    elderId: string,
    input: CreateServicePeriodInput,
  ): Promise<CreateServicePeriodResult> {
    this.seedPilotPeriods();
    const elder = this.database
      .prepare("SELECT id FROM elder_archives WHERE tenant_id = ? AND id = ?")
      .get(tenantId, elderId);
    if (!elder) return { outcome: "ELDER_NOT_FOUND" };

    const latestRevision = this.database
      .prepare(
        `SELECT revision_no, status FROM service_periods
          WHERE tenant_id = ? AND elder_id = ? AND year_month = ? AND service_mode = ?
          ORDER BY revision_no DESC LIMIT 1`,
      )
      .get(tenantId, elderId, input.yearMonth, input.serviceMode) as
      | { revision_no: number; status: ServicePeriodRecord["status"] }
      | undefined;
    if (latestRevision && latestRevision.status !== "RETURNED") {
      return { outcome: "DUPLICATE" };
    }

    const record: ServicePeriodRecord = {
      id: randomUUID(),
      tenantId,
      elderId,
      yearMonth: input.yearMonth,
      serviceMode: input.serviceMode,
      revision: (latestRevision?.revision_no ?? 0) + 1,
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
             id, tenant_id, elder_id, year_month, service_mode, revision_no, status,
             minimum_record_count, completed_record_count, self_paid_cents,
             voucher_cents, total_cents, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.tenantId,
          record.elderId,
          record.yearMonth,
          record.serviceMode,
          record.revision,
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
            WHERE tenant_id = ? AND id = ? AND status = 'PENDING_PERIOD'`,
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
    const existingTable = this.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'service_periods'",
      )
      .get();
    const createTableSql = `
      CREATE TABLE service_periods (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        elder_id TEXT NOT NULL,
        year_month TEXT NOT NULL,
        service_mode TEXT NOT NULL,
        revision_no INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        minimum_record_count INTEGER NOT NULL DEFAULT 4,
        completed_record_count INTEGER NOT NULL DEFAULT 0,
        self_paid_cents INTEGER NOT NULL DEFAULT 0,
        voucher_cents INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, elder_id, year_month, service_mode, revision_no),
        FOREIGN KEY (elder_id) REFERENCES elder_archives(id)
      )`;

    if (!existingTable) {
      this.database.exec(`${createTableSql};`);
    } else {
      const columns = this.database
        .prepare("PRAGMA table_info(service_periods)")
        .all() as unknown as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "revision_no")) {
        this.database.exec(`
          BEGIN IMMEDIATE;
          ALTER TABLE service_periods RENAME TO service_periods_legacy;
          DROP INDEX IF EXISTS idx_service_periods_tenant_elder_month;
          ${createTableSql};
          INSERT INTO service_periods (
            id, tenant_id, elder_id, year_month, service_mode, revision_no,
            status, minimum_record_count, completed_record_count,
            self_paid_cents, voucher_cents, total_cents, created_at
          )
          SELECT id, tenant_id, elder_id, year_month, service_mode, 1,
                 status, minimum_record_count, completed_record_count,
                 self_paid_cents, voucher_cents, total_cents, created_at
            FROM service_periods_legacy;
          DROP TABLE service_periods_legacy;
          COMMIT;
        `);
      }
    }
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_service_periods_tenant_elder_month
        ON service_periods (tenant_id, elder_id, year_month DESC, revision_no DESC);
    `);
  }

  private seedPilotPeriods(): void {
    const elderTable = this.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'elder_archives'",
      )
      .get();
    if (!elderTable) return;

    const rows: ServicePeriodRecord[] = [
      {
        id: "period-demo-lz-001-2026-08",
        tenantId: "tenant-lanzhou-pilot",
        elderId: "elder-lz-001",
        yearMonth: "2026-08",
        serviceMode: "PERIODIC_HOME_VISIT",
        revision: 1,
        status: "IN_SERVICE",
        minimumRecordCount: 4,
        completedRecordCount: 2,
        selfPaidCents: 0,
        voucherCents: 0,
        totalCents: 0,
        createdAt: "2026-08-01T09:00:00.000Z",
      },
      {
        id: "period-demo-lz-002-2026-08",
        tenantId: "tenant-lanzhou-pilot",
        elderId: "elder-lz-002",
        yearMonth: "2026-08",
        serviceMode: "DAY_CARE",
        revision: 1,
        status: "READY_FOR_REVIEW",
        minimumRecordCount: 4,
        completedRecordCount: 4,
        selfPaidCents: 0,
        voucherCents: 0,
        totalCents: 0,
        createdAt: "2026-08-02T09:00:00.000Z",
      },
      {
        id: "period-demo-lz-003-2026-08",
        tenantId: "tenant-lanzhou-pilot",
        elderId: "elder-lz-003",
        yearMonth: "2026-08",
        serviceMode: "APPOINTMENT_HOME_VISIT",
        revision: 1,
        status: "RETURNED",
        minimumRecordCount: 4,
        completedRecordCount: 4,
        selfPaidCents: 0,
        voucherCents: 0,
        totalCents: 0,
        createdAt: "2026-08-03T09:00:00.000Z",
      },
    ];
    this.database
      .prepare(
        `UPDATE service_periods
            SET revision_no = 2
          WHERE tenant_id = 'tenant-lanzhou-pilot'
            AND elder_id = 'elder-lz-003'
            AND year_month = '2026-08'
            AND service_mode = 'APPOINTMENT_HOME_VISIT'
            AND revision_no = 1
            AND status = 'DRAFT'
            AND NOT EXISTS (
              SELECT 1 FROM service_periods history
               WHERE history.tenant_id = service_periods.tenant_id
                 AND history.elder_id = service_periods.elder_id
                 AND history.year_month = service_periods.year_month
                 AND history.service_mode = service_periods.service_mode
                 AND history.status = 'RETURNED'
            )`,
      )
      .run();

    const insert = this.database.prepare(
      `INSERT INTO service_periods (
         id, tenant_id, elder_id, year_month, service_mode, revision_no, status,
         minimum_record_count, completed_record_count, self_paid_cents,
         voucher_cents, total_cents, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM elder_archives WHERE tenant_id = ? AND id = ?
        )
       ON CONFLICT(tenant_id, elder_id, year_month, service_mode, revision_no)
       DO NOTHING`,
    );
    for (const row of rows) {
      insert.run(
        row.id,
        row.tenantId,
        row.elderId,
        row.yearMonth,
        row.serviceMode,
        row.revision,
        row.status,
        row.minimumRecordCount,
        row.completedRecordCount,
        row.selfPaidCents,
        row.voucherCents,
        row.totalCents,
        row.createdAt,
        row.tenantId,
        row.elderId,
      );
    }
  }

  private mapRow(row: ServicePeriodRow): ServicePeriodRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      elderId: row.elder_id,
      yearMonth: row.year_month,
      serviceMode: row.service_mode,
      revision: row.revision_no,
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
