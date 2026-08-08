import { describe, expect, it } from "vitest";
import {
  validatePeriodForSubmission,
  type ServiceRecordSummary,
} from "./service-period.js";

const completeRecord = (id: string): ServiceRecordSummary => ({
  id,
  status: "SUBMITTED",
  stages: ["BEFORE", "DURING", "AFTER"],
  participantIds: ["staff-a", "staff-b"],
  participantConfirmations: ["staff-a", "staff-b"],
  concreteItemCount: 1,
});

describe("monthly service period validation", () => {
  it("accepts four complete service records and balanced amounts", () => {
    const issues = validatePeriodForSubmission({
      id: "period-1",
      tenantId: "tenant-a",
      records: [1, 2, 3, 4].map((id) => completeRecord(`record-${id}`)),
      selfPaidCents: 2000,
      voucherCents: 8000,
      totalCents: 10000,
    });

    expect(issues).toEqual([]);
  });

  it("does not treat shared evidence as another worker confirmation", () => {
    const record = completeRecord("record-1");
    record.participantConfirmations = ["staff-a"];
    const issues = validatePeriodForSubmission({
      id: "period-1",
      tenantId: "tenant-a",
      records: [
        record,
        completeRecord("record-2"),
        completeRecord("record-3"),
        completeRecord("record-4"),
      ],
      selfPaidCents: 0,
      voucherCents: 10000,
      totalCents: 10000,
    });

    expect(issues.map((issue) => issue.code)).toContain(
      "MISSING_PARTICIPANT_CONFIRMATION",
    );
  });
});
