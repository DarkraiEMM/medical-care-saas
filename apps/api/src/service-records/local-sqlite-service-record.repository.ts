import type {
  CreateServiceRecordInput,
  ServiceFormTemplate,
} from "@care/contracts";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateServiceRecordResult,
  ServiceRecordEntry,
  ServiceRecordRepository,
  ServiceEvidenceEntry,
  UploadServiceEvidenceInput,
} from "./service-record-repository.js";

interface ServiceRecordRow {
  id: string;
  tenant_id: string;
  period_id: string;
  template_id: string | null;
  template_version: number | null;
  status: ServiceRecordEntry["status"];
  occurred_at: string;
  started_at: string;
  ended_at: string;
  responsible_id: string;
  participant_ids_json: string;
  service_item_ids_json: string;
  log: string;
  stage_notes_json: string;
  answers_json: string;
  template_snapshot_json: string | null;
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
        `SELECT id, tenant_id, period_id, template_id, template_version,
                status, occurred_at, started_at,
                ended_at, responsible_id, participant_ids_json, service_item_ids_json, log,
                stage_notes_json, answers_json, template_snapshot_json, created_at
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
    templateSnapshot?: ServiceFormTemplate,
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
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      status: "DRAFT",
      occurredAt: input.occurredAt,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      responsibleId: input.responsibleId,
      participantIds: input.participantIds,
      serviceItemVersionIds: input.serviceItemVersionIds,
      log: input.log,
      stageNotes: input.stageNotes,
      answers: input.answers ?? [],
      templateSnapshot,
      createdAt: new Date().toISOString(),
    };

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO local_service_records (
             id, tenant_id, period_id, template_id, template_version,
             status, occurred_at, started_at,
             ended_at, responsible_id, participant_ids_json, service_item_ids_json, log,
             stage_notes_json, answers_json, template_snapshot_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.tenantId,
          record.periodId,
          record.templateId ?? null,
          record.templateVersion ?? null,
          record.status,
          record.occurredAt,
          record.startedAt,
          record.endedAt,
          record.responsibleId,
          JSON.stringify(record.participantIds),
          JSON.stringify(record.serviceItemVersionIds),
          record.log,
          JSON.stringify(record.stageNotes),
          JSON.stringify(record.answers),
          record.templateSnapshot
            ? JSON.stringify(record.templateSnapshot)
            : null,
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

  async listEvidence(
    tenantId: string,
    recordId: string,
  ): Promise<ServiceEvidenceEntry[]> {
    return this.database
      .prepare(
        `SELECT id, record_id AS recordId, stage, file_name AS fileName,
                mime_type AS mimeType, size_bytes AS sizeBytes,
                data_url AS dataUrl, created_at AS createdAt
           FROM local_service_evidence
          WHERE tenant_id = ? AND record_id = ?
          ORDER BY created_at ASC`,
      )
      .all(tenantId, recordId) as unknown as ServiceEvidenceEntry[];
  }

  async uploadEvidence(
    tenantId: string,
    recordId: string,
    input: UploadServiceEvidenceInput,
  ): Promise<ServiceEvidenceEntry | null> {
    const record = this.database
      .prepare(
        "SELECT id FROM local_service_records WHERE tenant_id = ? AND id = ?",
      )
      .get(tenantId, recordId);
    if (!record) return null;
    const evidence: ServiceEvidenceEntry = {
      id: randomUUID(),
      recordId,
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.database
      .prepare(
        `INSERT INTO local_service_evidence (
           id, tenant_id, record_id, stage, file_name, mime_type, size_bytes,
           data_url, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.id,
        tenantId,
        evidence.recordId,
        evidence.stage,
        evidence.fileName,
        evidence.mimeType,
        evidence.sizeBytes,
        evidence.dataUrl,
        evidence.createdAt,
      );
    return evidence;
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
        template_id TEXT,
        template_version INTEGER,
        status TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        responsible_id TEXT NOT NULL DEFAULT '',
        participant_ids_json TEXT NOT NULL,
        service_item_ids_json TEXT NOT NULL,
        log TEXT NOT NULL,
        stage_notes_json TEXT NOT NULL,
        answers_json TEXT NOT NULL DEFAULT '[]',
        template_snapshot_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (period_id) REFERENCES service_periods(id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_service_records_period_occurred
        ON local_service_records (tenant_id, period_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS local_service_evidence (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        data_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (record_id) REFERENCES local_service_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_service_evidence_record
        ON local_service_evidence (tenant_id, record_id, created_at);
    `);
    const columns = this.database
      .prepare("PRAGMA table_info(local_service_records)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "responsible_id")) {
      this.database.exec(
        "ALTER TABLE local_service_records ADD COLUMN responsible_id TEXT NOT NULL DEFAULT ''",
      );
      this.database.exec(
        `UPDATE local_service_records
            SET responsible_id = json_extract(participant_ids_json, '$[0]')
          WHERE responsible_id = ''`,
      );
    }
    if (!columns.some((column) => column.name === "template_id")) {
      this.database.exec(
        "ALTER TABLE local_service_records ADD COLUMN template_id TEXT",
      );
    }
    if (!columns.some((column) => column.name === "template_version")) {
      this.database.exec(
        "ALTER TABLE local_service_records ADD COLUMN template_version INTEGER",
      );
    }
    if (!columns.some((column) => column.name === "answers_json")) {
      this.database.exec(
        "ALTER TABLE local_service_records ADD COLUMN answers_json TEXT NOT NULL DEFAULT '[]'",
      );
    }
    if (!columns.some((column) => column.name === "template_snapshot_json")) {
      this.database.exec(
        "ALTER TABLE local_service_records ADD COLUMN template_snapshot_json TEXT",
      );
    }
  }

  private mapRow(row: ServiceRecordRow): ServiceRecordEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      periodId: row.period_id,
      templateId: row.template_id ?? undefined,
      templateVersion: row.template_version ?? undefined,
      status: row.status,
      occurredAt: row.occurred_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      responsibleId: row.responsible_id,
      participantIds: JSON.parse(row.participant_ids_json) as string[],
      serviceItemVersionIds: JSON.parse(row.service_item_ids_json) as string[],
      log: row.log,
      stageNotes: JSON.parse(
        row.stage_notes_json,
      ) as ServiceRecordEntry["stageNotes"],
      answers: JSON.parse(row.answers_json) as ServiceRecordEntry["answers"],
      templateSnapshot: row.template_snapshot_json
        ? (JSON.parse(row.template_snapshot_json) as ServiceFormTemplate)
        : undefined,
      createdAt: row.created_at,
    };
  }
}
