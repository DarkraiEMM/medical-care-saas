export interface ServiceRecordSummary {
  id: string;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "ARCHIVED";
  stages: Array<"BEFORE" | "DURING" | "AFTER">;
  participantIds: string[];
  participantConfirmations: string[];
  concreteItemCount: number;
}

export interface ServicePeriodSummary {
  id: string;
  tenantId: string;
  records: ServiceRecordSummary[];
  selfPaidCents: number;
  voucherCents: number;
  totalCents: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  recordId?: string;
}

const requiredStages = new Set(["BEFORE", "DURING", "AFTER"]);

export function validatePeriodForSubmission(
  period: ServicePeriodSummary,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (period.records.length < 4) {
    issues.push({
      code: "MINIMUM_RECORDS",
      message: "一个自然月至少需要四条实际服务记录。",
    });
  }

  if (period.selfPaidCents + period.voucherCents !== period.totalCents) {
    issues.push({
      code: "AMOUNT_MISMATCH",
      message: "自费金额与消费券金额之和必须等于合计金额。",
    });
  }

  for (const record of period.records) {
    const stages = new Set(record.stages);
    if (![...requiredStages].every((stage) => stages.has(stage as never))) {
      issues.push({
        code: "INCOMPLETE_STAGES",
        message: "服务记录必须完成前、中、后三个阶段。",
        recordId: record.id,
      });
    }
    if (record.concreteItemCount < 1) {
      issues.push({
        code: "MISSING_CONCRETE_ITEM",
        message: "不能只选择服务大类，必须记录具体服务子项。",
        recordId: record.id,
      });
    }
    const confirmations = new Set(record.participantConfirmations);
    if (!record.participantIds.every((id) => confirmations.has(id))) {
      issues.push({
        code: "MISSING_PARTICIPANT_CONFIRMATION",
        message: "团队材料可以共享，但每名参与者必须独立确认。",
        recordId: record.id,
      });
    }
  }

  return issues;
}
