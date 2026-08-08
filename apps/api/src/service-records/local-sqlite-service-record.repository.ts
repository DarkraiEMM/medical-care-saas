import type { CreateServiceRecordInput } from "@care/contracts";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateServiceRecordResult,
  ServiceRecordEntry,
  ServiceRecordRepository,
} from "./service-record-repository.js";

interface ServiceRecordRow {
  id: string;
  tenant_id: string;
  period_id: string;
  status: ServiceRecordEntry["status"];
  occurred_at: string;
  started_at: string;
  ended_at: string;
  participant_ids_json: string;
  service_item_ids_json: string;
  log: string;
  stage_notes_json: string;
  created_at: string;
}

export class LocalSqliteServiceRecordRepository implements ServiceRecordRepository {
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
    periodId: string,
  ): Promise<ServiceRecordEntry[]> {
    const rows = this.database
      .prepare(
        `SELECT id, tenant_id, period_id, status, occurred_at, started_at,
                ended_at, participant_ids_json, service_item_ids_json, log,
                stage_notes_json, created_at
           FROM local_service_records
          WHERE tenant_id = ? AND period_id = ?
          ORDER BY occurred_at DESC, created_at DESC`,
      )
      .all(tenantId, periodId) as unknown as ServiceRecordRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    tenantId: string,
    input: CreateServiceRecordInput,
  ): Promise<CreateServiceRecordResult> {
    const period = this.database
      .prepare(
        `SELECT year_month, elder_id, status
           FROM service_periods WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, input.periodId) as
      | {
          year_month: string;
          elder_id: string;
          status: "DRAFT" | "IN_SERVICE" | "READY_FOR_REVIEW" | "RETURNED";
        }
      | undefined;
    if (!period) return { outcome: "PERIOD_NOT_FOUND" };
    if (
      input.periodId.startsWith("period-demo-") ||
      !["DRAFT", "IN_SERVICE"].includes(period.status)
    ) {
      return { outcome: "PERIOD_NOT_EDITABLE" };
    }
    if (input.startedAt.slice(0, 7) !== period.year_month) {
      return { outcome: "DATE_OUTSIDE_PERIOD", yearMonth: period.year_month };
    }

    const record: ServiceRecordEntry = {
      id: randomUUID(),
      tenantId,
      periodId: input.periodId,
      status: "DRAFT",
      occurredAt: input.occurredAt,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      participantIds: input.participantIds,
      serviceItemVersionIds: input.serviceItemVersionIds,
      log: input.log,
      stageNotes: input.stageNotes,
      createdAt: new Date().toISOString(),
    };

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO local_service_records (
             id, tenant_id, period_id, status, occurred_at, started_at,
             ended_at, participant_ids_json, service_item_ids_json, log,
             stage_notes_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.tenantId,
          record.periodId,
          record.status,
          record.occurredAt,
          record.startedAt,
          record.endedAt,
          JSON.stringify(record.participantIds),
          JSON.stringify(record.serviceItemVersionIds),
          record.log,
          JSON.stringify(record.stageNotes),
          record.createdAt,
        );
      const count = this.database
        .prepare(
          `SELECT COUNT(*) AS total FROM local_service_records
            WHERE tenant_id = ? AND period_id = ?`,
        )
        .get(tenantId, input.periodId) as { total: number };
      this.database
        .prepare(
          `UPDATE service_periods
              SET completed_record_count = ?, status = 'IN_SERVICE'
            WHERE tenant_id = ? AND id = ?`,
        )
        .run(count.total, tenantId, input.periodId);
      this.database
        .prepare(
          `UPDATE elder_archives
              SET completed_records = ?
            WHERE tenant_id = ? AND id = ? AND status = 'IN_SERVICE'`,
        )
        .run(count.total, tenantId, period.elder_id);
      this.database.exec("COMMIT");
      return { outcome: "CREATED", record, completedCount: count.total };
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
      CREATE TABLE IF NOT EXISTS local_service_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        period_id TEXT NOT NULL,
        status TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        participant_ids_json TEXT NOT NULL,
        service_item_ids_json TEXT NOT NULL,
        log TEXT NOT NULL,
        stage_notes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (period_id) REFERENCES service_periods(id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_service_records_period_occurred
        ON local_service_records (tenant_id, period_id, occurred_at DESC);
    `);
  }

  private mapRow(row: ServiceRecordRow): ServiceRecordEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      periodId: row.period_id,
      status: row.status,
      occurredAt: row.occurred_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      participantIds: JSON.parse(row.participant_ids_json) as string[],
      serviceItemVersionIds: JSON.parse(row.service_item_ids_json) as string[],
      log: row.log,
      stageNotes: JSON.parse(
        row.stage_notes_json,
      ) as ServiceRecordEntry["stageNotes"],
      createdAt: row.created_at,
    };
  }
}
