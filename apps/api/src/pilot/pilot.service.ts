import { ForbiddenException, Injectable } from "@nestjs/common";
import { hasPermission, type IdentityContext } from "@care/domain";

interface PilotElder {
  id: string;
  tenantId: string;
  archiveNo: string;
  displayName: string;
  primaryContactName: string;
  currentPeriod: {
    yearMonth: string;
    completedRecords: number;
    minimumRecords: number;
    status: string;
  };
}

const pilotElders: PilotElder[] = [
  {
    id: "elder-lz-001",
    tenantId: "tenant-lanzhou-pilot",
    archiveNo: "LZ-2026-001",
    displayName: "张奶奶",
    primaryContactName: "张女士",
    currentPeriod: {
      yearMonth: "2026-08",
      completedRecords: 2,
      minimumRecords: 4,
      status: "IN_SERVICE",
    },
  },
  {
    id: "elder-isolation-001",
    tenantId: "tenant-isolation-test",
    archiveNo: "ISOLATION-001",
    displayName: "赵奶奶",
    primaryContactName: "赵女士",
    currentPeriod: {
      yearMonth: "2026-08",
      completedRecords: 4,
      minimumRecords: 4,
      status: "READY_FOR_REVIEW",
    },
  },
];

@Injectable()
export class PilotService {
  listElders(identity: IdentityContext): PilotElder[] {
    if (!identity.tenantId) return [];
    this.assertCanRead(identity, identity.tenantId);
    return pilotElders.filter((elder) => elder.tenantId === identity.tenantId);
  }

  getElder(identity: IdentityContext, elderId: string): PilotElder | undefined {
    const elder = pilotElders.find((candidate) => candidate.id === elderId);
    if (!elder) return undefined;
    this.assertCanRead(identity, elder.tenantId);
    return elder;
  }

  private assertCanRead(identity: IdentityContext, tenantId: string): void {
    if (!hasPermission(identity, "elder:read", tenantId)) {
      throw new ForbiddenException("无权访问该机构档案。");
    }
  }
}
