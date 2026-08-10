import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  LayoutDashboard,
  KeyRound,
  Clock3,
  Search,
  Settings,
  SlidersHorizontal,
  BriefcaseBusiness,
  FileSignature,
  ReceiptText,
  Images,
  Utensils,
  DatabaseBackup,
  Building2,
  UsersRound,
  ChevronDown,
  ChevronRight,
  BookOpen,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DynamicServiceFields } from "./DynamicServiceFields";
import { ServiceFormDesigner } from "./ServiceFormDesigner";
import { MerchantHelpCenter } from "./MerchantHelpCenter";
import {
  BusinessModulePage,
  type BusinessData,
  type BusinessView,
} from "./BusinessPages";
import type {
  ServiceFormAnswer,
  ServiceFormTemplate,
  ServiceFormWorkspace,
  ServiceTemplateField,
} from "./service-form-types";

type ServiceMode = keyof typeof serviceModeLabels;
type ElderStatus = keyof typeof statusLabels;
type ActiveView =
  | "overview"
  | "elders"
  | "services"
  | "service-config"
  | "support"
  | "qualifications"
  | "help"
  | BusinessView;

type OperationTask = {
  id: string;
  elderName: string;
  archiveNo: string;
  scheduledAt: string;
  serviceItems: string[];
  responsibleId: string;
  responsibleName?: string;
  participantIds: string[];
  participantNames?: string[];
  status:
    "NOT_STARTED" | "IN_PROGRESS" | "PENDING_REVIEW" | "RETURNED" | "APPROVED";
  revision: number;
  returnReason?: string;
  returnIssues?: Array<{
    stage: "BEFORE" | "DURING" | "AFTER";
    fieldId?: string;
    fieldLabel: string;
    reason: string;
    resolved: boolean;
  }>;
  templateSnapshot?: ServiceFormTemplate;
  history?: Array<{
    revision: number;
    status: string;
    reason: string;
    createdAt: string;
  }>;
  stageProgress: number;
  stages: Record<
    string,
    {
      note: string;
      recordedAt: string;
      locationStatus: string;
      evidence: EvidenceEntry[];
    }
  >;
  customerFeedback?: null | {
    evaluatorType: string;
    relationship: string;
    satisfaction: string;
    tags: string[];
    text: string;
    refusalReason: string;
    mediaIds: string[];
    media: Array<{
      id: string;
      mediaType: "IMAGE" | "AUDIO" | "SIGNATURE";
      fileName: string;
      dataUrl: string;
      durationSeconds: number;
    }>;
  };
};
type SupportGrant = {
  id: string;
  reason: string;
  scope: string;
  allowDownload: boolean;
  expiresAt: string;
  revokedAt?: string;
  active: boolean;
  issuedBy: string;
};
type OperationOverview = {
  pendingReview: number;
  returned: number;
  inProgress: number;
  activeSupportGrants: number;
  tenant: {
    name: string;
    status: string;
    validUntil: string;
    capacityMb: number;
    usagePercent: number;
    subscription: {
      planName: string;
      monthlyPriceCents: number;
      currentPeriodEnd: string;
    };
  };
};

type ElderApiRecord = {
  id: string;
  archiveNo: string;
  displayName: string;
  primaryContactName: string;
  primaryContactPhoneMasked: string;
  serviceMode: ServiceMode;
  completedRecords: number;
  minimumRecords: number;
  status: ElderStatus;
};

type ServicePeriod = {
  id: string;
  elderId: string;
  yearMonth: string;
  serviceMode: ServiceMode;
  revision: number;
  status: "DRAFT" | "IN_SERVICE" | "READY_FOR_REVIEW" | "RETURNED";
  minimumRecordCount: number;
  completedRecordCount: number;
  selfPaidCents: number;
  voucherCents: number;
  totalCents: number;
};

type ServiceRecordEntry = {
  id: string;
  periodId: string;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "ARCHIVED";
  startedAt: string;
  endedAt: string;
  responsibleId: string;
  participantIds: string[];
  serviceItemVersionIds: string[];
  templateId?: string;
  templateVersion?: number;
  answers: ServiceFormAnswer[];
  templateSnapshot?: ServiceFormTemplate;
  log: string;
  stageNotes: { BEFORE: string; DURING: string; AFTER: string };
};

type EvidenceEntry = {
  id: string;
  recordId: string;
  stage: "BEFORE" | "DURING" | "AFTER";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

type WorkspaceConfig = {
  rules: {
    beforeNoteRequired: boolean;
    duringNoteRequired: boolean;
    afterNoteRequired: boolean;
    resultSummaryRequired: boolean;
    evidenceEnabled: boolean;
    evidenceRequired: boolean;
  };
  enabledServiceItemIds: string[];
  categories: Array<{
    id: string;
    label: string;
    enabled?: boolean;
    order?: number;
    items: Array<{
      id: string;
      label: string;
      enabled?: boolean;
      order?: number;
    }>;
  }>;
  staff: Array<{ id: string; displayName: string; department: string }>;
};

type ServiceOrder = { elder: ElderApiRecord; period: ServicePeriod };

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const developmentHeaders = {
  "content-type": "application/json",
  "x-dev-tenant-id": "tenant-lanzhou-pilot",
  "x-dev-role": "TENANT_ADMIN",
};
const readOptions = { headers: developmentHeaders, cache: "no-store" as const };

const serviceModeLabels = {
  PERIODIC_HOME_VISIT: "定期上门",
  APPOINTMENT_HOME_VISIT: "预约上门",
  DAY_CARE: "日托服务",
  RESIDENTIAL: "机构常住",
  SHORT_TERM_LIVE_IN: "短期住家护工",
  LONG_TERM_LIVE_IN: "长期住家护工",
} as const;

const statusLabels = {
  PENDING_PERIOD: "待建周期",
  IN_SERVICE: "服务中",
  READY_FOR_REVIEW: "待审核",
  RETURNED: "待修改",
} as const;

const periodStatusLabels = {
  DRAFT: "待开始",
  IN_SERVICE: "服务中",
  READY_FOR_REVIEW: "待审核",
  RETURNED: "待修改",
} as const;

const tenantStatusLabels = {
  ACTIVE: "正常使用",
  READ_ONLY: "只读",
  SUSPENDED: "已停用",
} as const;

const navigationGroups: Array<{
  group: string;
  items: Array<{
    label: string;
    icon: typeof LayoutDashboard;
    view?: ActiveView;
  }>;
}> = [
  {
    group: "工作台",
    items: [{ label: "今日概览", icon: LayoutDashboard, view: "overview" }],
  },
  {
    group: "客户与服务",
    items: [
      { label: "老人档案", icon: UsersRound, view: "elders" },
      { label: "服务关系", icon: BriefcaseBusiness, view: "relationships" },
      { label: "服务任务", icon: ClipboardList, view: "tasks" },
      { label: "服务审核", icon: ClipboardList, view: "services" },
    ],
  },
  {
    group: "合同与资金",
    items: [
      { label: "合同档案", icon: FileSignature, view: "contracts" },
      { label: "消费券核销", icon: ReceiptText, view: "subsidies" },
    ],
  },
  {
    group: "机构运营",
    items: [
      { label: "组织与员工", icon: Building2, view: "organization" },
      { label: "工作量与质量", icon: ClipboardList, view: "performance" },
      { label: "绩效管理", icon: ClipboardList, view: "performance-management" },
      { label: "宣传素材", icon: Images, view: "promotion" },
      { label: "食品追溯", icon: Utensils, view: "food" },
      { label: "数据归档与导出", icon: DatabaseBackup, view: "archives" },
    ],
  },
  {
    group: "配置与安全",
    items: [
      { label: "服务项目", icon: ClipboardList, view: "service-items" },
      {
        label: "服务表单",
        icon: SlidersHorizontal,
        view: "service-config",
      },
      { label: "机构资质", icon: BadgeCheck, view: "qualifications" },
      { label: "临时支持授权", icon: KeyRound, view: "support" },
      { label: "机构设置", icon: Settings, view: "settings" },
    ],
  },
  {
    group: "帮助",
    items: [{ label: "帮助中心", icon: BookOpen, view: "help" }],
  },
];

const emptyBusinessData: BusinessData = {
  overview: {},
  departments: [],
  staff: [],
  performance: [],
  performanceTemplates: {},
  performanceSchemes: [],
  sales: [],
  performanceStatements: [],
  contracts: [],
  subsidies: [],
  promotion: [],
  food: [],
  engagements: [],
  archives: [],
  settings: {},
};

function formatChinaTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function formatDynamicAnswer(
  field: ServiceTemplateField,
  answer: ServiceFormAnswer,
): string {
  if (Array.isArray(answer.value)) {
    return answer.value
      .map(
        (value) =>
          field.options.find((option) => option.id === value)?.label ?? value,
      )
      .join("、");
  }
  if (answer.value === null || answer.value === "") return "未填写";
  if (field.type === "SINGLE_CHOICE") {
    return (
      field.options.find((option) => option.id === answer.value)?.label ??
      String(answer.value)
    );
  }
  return `${String(answer.value)}${field.unit ?? ""}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadDemoEvidenceFiles(): Promise<
  Array<[EvidenceEntry["stage"], File]>
> {
  const assets = [
    ["BEFORE", "/demo-evidence/ai-demo-before.png", "ai-demo-before.png"],
    ["DURING", "/demo-evidence/ai-demo-during.png", "ai-demo-during.png"],
    ["AFTER", "/demo-evidence/ai-demo-after.png", "ai-demo-after.png"],
  ] as const;
  return Promise.all(
    assets.map(async ([stage, url, name]) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return [stage, new File([blob], name, { type: "image/png" })] as const;
    }),
  );
}

async function getProblem(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (
      typeof body.message === "object" &&
      body.message !== null &&
      "message" in body.message &&
      typeof (body.message as { message?: unknown }).message === "string"
    ) {
      return String((body.message as { message: string }).message);
    }
  } catch {
    // The fallback is clearer than exposing a response parsing failure.
  }
  return fallback;
}

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [expandedNavigation, setExpandedNavigation] = useState<string[]>([
    "工作台",
    "客户与服务",
    "帮助",
  ]);
  const [elders, setElders] = useState<ElderApiRecord[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [formWorkspace, setFormWorkspace] =
    useState<ServiceFormWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  const [isCreateElderOpen, setIsCreateElderOpen] = useState(false);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [selectedElder, setSelectedElder] = useState<ElderApiRecord | null>(
    null,
  );
  const [elderPeriods, setElderPeriods] = useState<ServicePeriod[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [records, setRecords] = useState<ServiceRecordEntry[]>([]);
  const [evidenceByRecord, setEvidenceByRecord] = useState<
    Record<string, EvidenceEntry[]>
  >({});
  const [formError, setFormError] = useState("");
  const [recordSuccess, setRecordSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [operationTasks, setOperationTasks] = useState<OperationTask[]>([]);
  const [operationOverview, setOperationOverview] =
    useState<OperationOverview | null>(null);
  const [supportGrants, setSupportGrants] = useState<SupportGrant[]>([]);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});
  const [reviewStage, setReviewStage] = useState<
    Record<string, "BEFORE" | "DURING" | "AFTER">
  >({});
  const [reviewField, setReviewField] = useState<Record<string, string>>({});
  const [reviewFilter, setReviewFilter] = useState<
    "PENDING_REVIEW" | "RETURNED" | "ALL"
  >("PENDING_REVIEW");
  const [businessData, setBusinessData] =
    useState<BusinessData>(emptyBusinessData);

  function submitQuickSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = quickSearch.trim().toLowerCase();
    if (!keyword) {
      setPageError("请输入老人姓名、档案号、任务或功能名称。");
      return;
    }
    setPageError("");
    const matchedNavigation = navigationGroups
      .flatMap((group) => group.items.map((item) => ({ ...item, group: group.group })))
      .find((item) => item.view && item.label.toLowerCase().includes(keyword));
    if (matchedNavigation?.view) {
      setExpandedNavigation((current) =>
        current.includes(matchedNavigation.group)
          ? current
          : [...current, matchedNavigation.group],
      );
      setActiveView(matchedNavigation.view);
      setNotice(`已进入${matchedNavigation.label}。`);
      return;
    }
    const elder = elders.find((item) =>
      `${item.displayName}${item.archiveNo}`.toLowerCase().includes(keyword),
    );
    if (elder) {
      setExpandedNavigation((current) =>
        current.includes("客户与服务") ? current : [...current, "客户与服务"],
      );
      setActiveView("elders");
      void openElderArchive(elder);
      return;
    }
    const task = operationTasks.find((item) =>
      `${item.elderName}${item.serviceItems.join("")}`.toLowerCase().includes(keyword),
    );
    if (task) {
      setExpandedNavigation((current) =>
        current.includes("客户与服务") ? current : [...current, "客户与服务"],
      );
      setActiveView("tasks");
      setNotice(`已定位到${task.elderName}的服务任务。`);
      return;
    }
    setPageError(`没有找到与“${quickSearch.trim()}”相关的内容。`);
  }

  const loadBusiness = useCallback(async () => {
    const endpoints = [
      "business-overview",
      "departments",
      "staff-directory",
      `staff-performance?month=${new Date().toISOString().slice(0, 7)}`,
      "contracts",
      "subsidies",
      "promotion-assets",
      "food-traces",
      "engagements",
      "archives",
      "settings",
      "performance-templates",
      "performance-schemes",
      `sales-records?month=${new Date().toISOString().slice(0, 7)}`,
      `performance-statements?month=${new Date().toISOString().slice(0, 7)}`,
    ];
    const responses = await Promise.all(
      endpoints.map((endpoint) =>
        fetch(`${apiBaseUrl}/organization/${endpoint}`, readOptions),
      ),
    );
    if (responses.some((response) => !response.ok))
      throw new Error("BUSINESS_MODULES_UNAVAILABLE");
    const values = await Promise.all(
      responses.map(
        async (response) => ((await response.json()) as { data: unknown }).data,
      ),
    );
    setBusinessData({
      overview: values[0] as Record<string, number>,
      departments: values[1] as BusinessData["departments"],
      staff: values[2] as BusinessData["staff"],
      performance: values[3] as BusinessData["performance"],
      contracts: values[4] as BusinessData["contracts"],
      subsidies: values[5] as BusinessData["subsidies"],
      promotion: values[6] as BusinessData["promotion"],
      food: values[7] as BusinessData["food"],
      engagements: values[8] as BusinessData["engagements"],
      archives: values[9] as BusinessData["archives"],
      settings: values[10] as BusinessData["settings"],
      performanceTemplates: values[11] as BusinessData["performanceTemplates"],
      performanceSchemes: values[12] as BusinessData["performanceSchemes"],
      sales: values[13] as BusinessData["sales"],
      performanceStatements: values[14] as BusinessData["performanceStatements"],
    });
  }, []);

  const loadOperations = useCallback(async () => {
    const [overviewResponse, tasksResponse, grantsResponse] = await Promise.all(
      [
        fetch(`${apiBaseUrl}/organization/operations/overview`, readOptions),
        fetch(`${apiBaseUrl}/organization/operations/tasks`, readOptions),
        fetch(
          `${apiBaseUrl}/organization/operations/support-grants`,
          readOptions,
        ),
      ],
    );
    if (!overviewResponse.ok || !tasksResponse.ok || !grantsResponse.ok)
      throw new Error("OPERATIONS_UNAVAILABLE");
    setOperationOverview(
      ((await overviewResponse.json()) as { data: OperationOverview }).data,
    );
    setOperationTasks(
      ((await tasksResponse.json()) as { data: OperationTask[] }).data,
    );
    setSupportGrants(
      ((await grantsResponse.json()) as { data: SupportGrant[] }).data,
    );
  }, []);

  const loadElders = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/organization/elders`, {
      ...readOptions,
    });
    if (!response.ok) throw new Error("ELDERS_UNAVAILABLE");
    const result = (await response.json()) as { data: ElderApiRecord[] };
    setElders(result.data);
    return result.data;
  }, []);

  const loadConfig = useCallback(async () => {
    const response = await fetch(
      `${apiBaseUrl}/organization/service-workspace-config`,
      readOptions,
    );
    if (!response.ok) throw new Error("CONFIG_UNAVAILABLE");
    const result = (await response.json()) as { data: WorkspaceConfig };
    setConfig(result.data);
    return result.data;
  }, []);

  const loadFormWorkspace = useCallback(async () => {
    const response = await fetch(
      `${apiBaseUrl}/organization/service-form-workspace`,
      readOptions,
    );
    if (!response.ok) throw new Error("FORM_WORKSPACE_UNAVAILABLE");
    const result = (await response.json()) as { data: ServiceFormWorkspace };
    setFormWorkspace(result.data);
    return result.data;
  }, []);

  const loadOrders = useCallback(async (elderList: ElderApiRecord[]) => {
    const periodLists = await Promise.all(
      elderList.map(async (elder) => {
        const response = await fetch(
          `${apiBaseUrl}/organization/elders/${elder.id}/service-periods`,
          readOptions,
        );
        if (!response.ok) return [] as ServiceOrder[];
        const result = (await response.json()) as { data: ServicePeriod[] };
        return result.data.map((period) => ({ elder, period }));
      }),
    );
    const nextOrders = periodLists
      .flat()
      .sort((a, b) =>
        `${b.period.yearMonth}-${b.period.revision}`.localeCompare(
          `${a.period.yearMonth}-${a.period.revision}`,
        ),
      );
    setOrders(nextOrders);
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const health = await fetch(`${apiBaseUrl}/health`, { cache: "no-store" });
      if (!health.ok) throw new Error("HEALTH_UNAVAILABLE");
      const elderList = await loadElders();
      await Promise.all([
        loadConfig(),
        loadFormWorkspace(),
        loadOrders(elderList),
        loadOperations(),
        loadBusiness(),
      ]);
      setIsDisconnected(false);
    } catch {
      setIsDisconnected(true);
      setPageError("业务服务尚未连接。启动本地演示后，可在这里重新连接。");
    } finally {
      setIsLoading(false);
    }
  }, [
    loadBusiness,
    loadConfig,
    loadElders,
    loadFormWorkspace,
    loadOperations,
    loadOrders,
  ]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function reviewOperationTask(
    taskId: string,
    action: "APPROVE" | "RETURN",
  ) {
    setPageError("");
    const task = operationTasks.find((item) => item.id === taskId);
    const stage = reviewStage[taskId] || "AFTER";
    const fieldId = reviewField[taskId] || undefined;
    const field = task?.templateSnapshot?.fields.find((item) => item.id === fieldId);
    const reason = reviewReason[taskId] || "";
    const response = await fetch(
      `${apiBaseUrl}/organization/operations/tasks/${taskId}/review`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify(
          action === "APPROVE"
            ? { action }
            : {
                action,
                issues: [
                  {
                    stage,
                    fieldId,
                    fieldLabel: field?.label || `${stage === "BEFORE" ? "服务前" : stage === "DURING" ? "服务中" : "服务后"}记录`,
                    reason,
                    resolved: false,
                  },
                ],
              },
        ),
      },
    );
    if (!response.ok) {
      setPageError(
        action === "RETURN"
          ? "退回时必须填写原因，且任务需要处于待审核状态。"
          : "当前任务不能审核。",
      );
      return;
    }
    setNotice(
      action === "APPROVE"
        ? "服务任务已审核通过。"
        : "服务任务已退回，员工可在小程序中修改后重新提交。",
    );
    await loadOperations();
  }

  async function createSupportGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `${apiBaseUrl}/organization/operations/support-grants`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({
          reason: data.get("reason"),
          scope: data.get("scope"),
          durationHours: Number(data.get("durationHours")),
          allowDownload: data.get("allowDownload") === "on",
        }),
      },
    );
    if (!response.ok) {
      setPageError("授权创建失败。");
      return;
    }
    setNotice("临时支持授权已创建，平台后台可立即看到。");
    event.currentTarget.reset();
    await loadOperations();
  }

  async function revokeSupportGrant(grantId: string) {
    const response = await fetch(
      `${apiBaseUrl}/organization/operations/support-grants/${grantId}/revoke`,
      { method: "POST", headers: developmentHeaders, body: "{}" },
    );
    if (!response.ok) {
      setPageError("授权撤回失败。");
      return;
    }
    setNotice("授权已提前撤回，平台访问权立即失效。");
    await loadOperations();
  }

  async function openElderArchive(elder: ElderApiRecord) {
    setSelectedElder(elder);
    setElderPeriods([]);
    setFormError("");
    const response = await fetch(
      `${apiBaseUrl}/organization/elders/${elder.id}/service-periods`,
      { headers: developmentHeaders },
    );
    if (response.ok) {
      const result = (await response.json()) as { data: ServicePeriod[] };
      setElderPeriods(result.data);
    }
  }

  async function createElder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      displayName: String(form.get("elderName") ?? "").trim(),
      primaryContactName: String(form.get("contactName") ?? "").trim(),
      primaryContactPhone: String(form.get("contactPhone") ?? "").trim(),
      serviceMode: String(form.get("serviceMode") ?? ""),
    };
    if (
      !body.displayName ||
      !body.primaryContactName ||
      !/^1[3-9]\d{9}$/.test(body.primaryContactPhone) ||
      !body.serviceMode
    ) {
      setFormError("请填写完整的虚拟档案信息和11位手机号。");
      return;
    }
    setIsSaving(true);
    const response = await fetch(`${apiBaseUrl}/organization/elders`, {
      method: "POST",
      headers: developmentHeaders,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setFormError(await getProblem(response, "档案保存失败。"));
    } else {
      await loadElders();
      setIsCreateElderOpen(false);
      setNotice("档案已保存；服务任务请到“服务计划与派单”建立。");
    }
    setIsSaving(false);
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const elderId = String(form.get("elderId") ?? "");
    const selfPaidCents = Math.round(Number(form.get("selfPaidYuan")) * 100);
    const voucherCents = Math.round(Number(form.get("voucherYuan")) * 100);
    const body = {
      yearMonth: String(form.get("yearMonth") ?? ""),
      serviceMode: String(form.get("serviceMode") ?? ""),
      minimumRecordCount: Number(form.get("minimumRecordCount")),
      selfPaidCents,
      voucherCents,
      totalCents: selfPaidCents + voucherCents,
    };
    if (!elderId || !body.yearMonth || !body.serviceMode) {
      setFormError("请选择老人、核销月份和服务形态。");
      return;
    }
    setIsSaving(true);
    const response = await fetch(
      `${apiBaseUrl}/organization/elders/${elderId}/service-periods`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      setFormError(await getProblem(response, "服务工单创建失败。"));
    } else {
      const elderList = await loadElders();
      await loadOrders(elderList);
      setIsCreateOrderOpen(false);
      setNotice("月度服务工单已建立，后续记录会自动归入老人档案。");
    }
    setIsSaving(false);
  }

  async function openOrder(order: ServiceOrder) {
    setSelectedOrder(order);
    setRecords([]);
    setEvidenceByRecord({});
    setFormError("");
    setRecordSuccess("");
    const response = await fetch(
      `${apiBaseUrl}/organization/service-periods/${order.period.id}/records`,
      { headers: developmentHeaders },
    );
    if (!response.ok) {
      setFormError("无法读取服务记录。");
      return;
    }
    const result = (await response.json()) as { data: ServiceRecordEntry[] };
    setRecords(result.data);
    const evidencePairs = await Promise.all(
      result.data.map(async (record) => {
        const evidenceResponse = await fetch(
          `${apiBaseUrl}/organization/service-records/${record.id}/evidence`,
          { headers: developmentHeaders },
        );
        if (!evidenceResponse.ok) return [record.id, []] as const;
        const evidenceResult = (await evidenceResponse.json()) as {
          data: EvidenceEntry[];
        };
        return [record.id, evidenceResult.data] as const;
      }),
    );
    setEvidenceByRecord(Object.fromEntries(evidencePairs));
  }

  async function uploadEvidence(
    recordId: string,
    stage: EvidenceEntry["stage"],
    file: File,
  ): Promise<EvidenceEntry> {
    if (file.size > 5 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
    const response = await fetch(
      `${apiBaseUrl}/organization/service-records/${recordId}/evidence`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({
          stage,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          dataUrl: await fileToDataUrl(file),
        }),
      },
    );
    if (!response.ok) throw new Error("IMAGE_UPLOAD_FAILED");
    const result = (await response.json()) as { data: EvidenceEntry };
    return result.data;
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder || !config || !formWorkspace) return;
    const form = new FormData(event.currentTarget);
    setRecordSuccess("");
    const responsibleId = String(form.get("responsibleId") ?? "");
    const participantIds = form.getAll("participantIds").map(String);
    const serviceDate = String(form.get("serviceDate") ?? "");
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");
    const template = formWorkspace.publishedTemplate;
    const answers: ServiceFormAnswer[] = [];
    const evidenceFiles: Array<[EvidenceEntry["stage"], File]> = [];
    const demoFiles = await loadDemoEvidenceFiles();
    let missingRequiredLabel = "";

    for (const field of template.fields.filter((item) => item.enabled)) {
      let value: ServiceFormAnswer["value"] = null;
      if (field.type === "MULTI_CHOICE") {
        value = form.getAll(`answer:${field.id}`).map(String);
      } else if (field.type === "NUMBER") {
        const raw = String(form.get(`answer:${field.id}`) ?? "").trim();
        value = raw ? Number(raw) : null;
      } else if (field.type === "IMAGE") {
        const file = form.get(`image:${field.id}`);
        const names: string[] = [];
        if (file instanceof File && file.size > 0) {
          evidenceFiles.push([field.evidenceStage ?? "AFTER", file]);
          names.push(file.name);
        }
        if (form.has(`demo:${field.id}`) && field.evidenceStage) {
          const demo = demoFiles.find(
            ([stage]) => stage === field.evidenceStage,
          );
          if (demo) {
            evidenceFiles.push(demo);
            names.push(demo[1].name);
          }
        }
        value = names;
      } else {
        value = String(form.get(`answer:${field.id}`) ?? "").trim();
      }
      const empty =
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (field.required && empty && !missingRequiredLabel) {
        missingRequiredLabel = field.label;
      }
      answers.push({ fieldId: field.id, fieldType: field.type, value });
    }

    const answerForPreset = (presetCode: string): string => {
      const field = template.fields.find(
        (item) => item.presetCode === presetCode,
      );
      if (!field) return "";
      const value = answers.find((item) => item.fieldId === field.id)?.value;
      return typeof value === "string" ? value : "";
    };
    const stageNotes = {
      BEFORE: answerForPreset("SERVICE_BEFORE_NOTE"),
      DURING: answerForPreset("SERVICE_DURING_NOTE"),
      AFTER: answerForPreset("SERVICE_AFTER_NOTE"),
    };
    const log = answerForPreset("SERVICE_RESULT");
    const choiceFieldIds = new Set(
      template.fields
        .filter(
          (field) =>
            field.type === "SINGLE_CHOICE" || field.type === "MULTI_CHOICE",
        )
        .map((field) => field.id),
    );
    const serviceItemVersionIds = answers.flatMap((answer) => {
      if (!choiceFieldIds.has(answer.fieldId)) return [];
      if (Array.isArray(answer.value)) return answer.value;
      return typeof answer.value === "string" && answer.value
        ? [answer.value]
        : [];
    });
    if (
      !serviceDate ||
      !startTime ||
      !endTime ||
      !responsibleId ||
      !participantIds.includes(responsibleId) ||
      missingRequiredLabel
    ) {
      setFormError(
        missingRequiredLabel
          ? `请填写必填字段：${missingRequiredLabel}。`
          : "请选择参与人员，并从参与人员中指定一名负责人。",
      );
      return;
    }
    setIsSaving(true);
    setFormError("");
    const startedAt = `${serviceDate}T${startTime}:00+08:00`;
    const endedAt = `${serviceDate}T${endTime}:00+08:00`;
    const response = await fetch(
      `${apiBaseUrl}/organization/service-periods/${selectedOrder.period.id}/records`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({
          occurredAt: startedAt,
          startedAt,
          endedAt,
          responsibleId,
          participantIds,
          templateId: template.id,
          templateVersion: template.version,
          answers,
          serviceItemVersionIds,
          log,
          stages: ["BEFORE", "DURING", "AFTER"],
          stageNotes,
          vitalSigns: [],
        }),
      },
    );
    if (!response.ok) {
      setRecordSuccess("");
      setFormError(await getProblem(response, "服务记录保存失败。"));
      setIsSaving(false);
      return;
    }
    const result = (await response.json()) as {
      data: { record: ServiceRecordEntry; completedCount: number };
    };
    let evidenceUploadFailed = false;
    try {
      const uploaded = await Promise.all(
        evidenceFiles.map(([stage, file]) =>
          uploadEvidence(result.data.record.id, stage, file),
        ),
      );
      setEvidenceByRecord((current) => ({
        ...current,
        [result.data.record.id]: uploaded,
      }));
    } catch {
      evidenceUploadFailed = true;
      setFormError("文字记录已保存，但有图片上传失败；当前验证版单张限5MB。");
    }
    setRecords((current) => [result.data.record, ...current]);
    const updatedOrder = {
      ...selectedOrder,
      period: {
        ...selectedOrder.period,
        completedRecordCount: result.data.completedCount,
        status: "IN_SERVICE" as const,
      },
    };
    setSelectedOrder(updatedOrder);
    setOrders((current) =>
      current.map((order) =>
        order.period.id === updatedOrder.period.id ? updatedOrder : order,
      ),
    );
    setNotice("服务记录已保存，并自动关联到老人档案。");
    setRecordSuccess(
      evidenceUploadFailed
        ? "服务记录已保存，但部分图片上传失败，请根据红色提示补传。"
        : evidenceFiles.length > 0
          ? `服务记录及所选图片已保存，并已关联老人档案。当前完成 ${result.data.completedCount} / ${selectedOrder.period.minimumRecordCount} 条。`
          : `服务记录已保存，并已关联老人档案。当前完成 ${result.data.completedCount} / ${selectedOrder.period.minimumRecordCount} 条。`,
    );
    setIsSaving(false);
  }

  async function saveFormTemplate() {
    if (!formWorkspace) return;
    setIsSaving(true);
    setPageError("");
    const response = await fetch(
      `${apiBaseUrl}/organization/service-form-template`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({ template: formWorkspace.draftTemplate }),
      },
    );
    if (!response.ok) {
      setPageError(await getProblem(response, "表单草稿保存失败。"));
    } else {
      const result = (await response.json()) as { data: ServiceFormWorkspace };
      setFormWorkspace(result.data);
      setNotice("服务表单草稿已保存。");
    }
    setIsSaving(false);
  }

  async function publishFormTemplate() {
    if (!formWorkspace) return;
    setIsSaving(true);
    setPageError("");
    const saveResponse = await fetch(
      `${apiBaseUrl}/organization/service-form-template`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({ template: formWorkspace.draftTemplate }),
      },
    );
    if (!saveResponse.ok) {
      setPageError(await getProblem(saveResponse, "发布前保存草稿失败。"));
      setIsSaving(false);
      return;
    }
    const response = await fetch(
      `${apiBaseUrl}/organization/service-form-template/publish`,
      { method: "POST", headers: developmentHeaders, body: "{}" },
    );
    if (!response.ok) {
      setPageError(await getProblem(response, "表单发布失败。"));
    } else {
      const result = (await response.json()) as { data: ServiceFormWorkspace };
      setFormWorkspace(result.data);
      setNotice(
        `服务表单第 ${result.data.publishedTemplate.version} 版已发布。`,
      );
    }
    setIsSaving(false);
  }

  async function uploadQualification(code: string, fileName: string) {
    setPageError("");
    const response = await fetch(
      `${apiBaseUrl}/organization/qualifications/${code}/upload`,
      {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({ fileName }),
      },
    );
    if (!response.ok) {
      setPageError(await getProblem(response, "资质状态修改失败。"));
      return;
    }
    const result = (await response.json()) as { data: ServiceFormWorkspace };
    setFormWorkspace(result.data);
    setNotice("材料已上传，可以提交平台审核。");
  }

  async function submitQualification(code: string) {
    setPageError("");
    const response = await fetch(
      `${apiBaseUrl}/organization/qualifications/${code}/submit`,
      { method: "POST", headers: developmentHeaders, body: "{}" },
    );
    if (!response.ok) {
      setPageError(await getProblem(response, "资质提交失败。"));
      return;
    }
    const result = (await response.json()) as { data: ServiceFormWorkspace };
    setFormWorkspace(result.data);
    setNotice("资质已提交平台审核，审核完成前相关专业服务保持关闭。");
  }

  return (
    <main
      className={
        activeView === "service-config"
          ? "workspace-shell designer-mode"
          : activeView === "overview"
            ? "workspace-shell overview-mode"
            : ["elders", "services", "support"].includes(activeView)
              ? "workspace-shell"
              : "workspace-shell wide-mode"
      }
    >
      <aside className="side-rail">
        <div className="brand-mark">
          <span>照护</span>
          <small>机构工作台</small>
        </div>
        <nav aria-label="主要导航">
          {navigationGroups.map((section) => (
            <section className="nav-group" key={section.group}>
              <button
                className="nav-group-toggle"
                type="button"
                aria-expanded={expandedNavigation.includes(section.group)}
                onClick={() =>
                  setExpandedNavigation((current) =>
                    current.includes(section.group)
                      ? current.filter((group) => group !== section.group)
                      : [...current, section.group],
                  )
                }
              >
                <span>{section.group}</span>
                {expandedNavigation.includes(section.group) ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              {expandedNavigation.includes(section.group)
                ? section.items.map(({ label, icon: Icon, view }) => (
                <button
                  className={
                    view === activeView ? "nav-item active" : "nav-item"
                  }
                  key={label}
                  type="button"
                  disabled={!view}
                  onClick={() => view && setActiveView(view)}
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </button>
                  ))
                : null}
            </section>
          ))}
        </nav>
      </aside>

      <section className="main-panel">
        <header className="workspace-topbar">
          <form className="workspace-search" onSubmit={submitQuickSearch}>
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="搜索老人、任务、档案号或功能"
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder="搜索老人、任务、档案号或功能"
            />
            <button type="submit">查找</button>
          </form>
          <div>
            <mark>演示环境</mark>
            <strong>{operationOverview?.tenant.name ?? "正在连接机构"}</strong>
            <span>{operationOverview?.tenant.subscription.planName ?? ""}</span>
          </div>
        </header>
        {isDisconnected ? (
          <section className="connection-state" role="alert">
            <div>
              <strong>业务服务尚未连接</strong>
              <span>请先运行“启动本地演示”，服务恢复后无需刷新页面。</span>
            </div>
            <button type="button" disabled={isLoading} onClick={() => void initialize()}>
              {isLoading ? "正在连接…" : "重新连接"}
            </button>
          </section>
        ) : null}
        {activeView === "overview" ? (
          <>
            <header className="topline dashboard-heading">
              <div>
                <p>机构运营与履约风险</p>
                <h1>今日工作台</h1>
              </div>
              <span>
                {operationOverview?.tenant.name ?? "正在读取机构配置"}
              </span>
            </header>
            <section className="overview-metrics">
              <article>
                <Clock3 size={19} />
                <strong>{operationOverview?.inProgress ?? 0}</strong>
                <span>执行中任务</span>
              </article>
              <article>
                <ClipboardList size={19} />
                <strong>{operationOverview?.pendingReview ?? 0}</strong>
                <span>待审核</span>
              </article>
              <article>
                <AlertTriangle size={19} />
                <strong>{operationOverview?.returned ?? 0}</strong>
                <span>待员工修改</span>
              </article>
              <article>
                <KeyRound size={19} />
                <strong>{operationOverview?.activeSupportGrants ?? 0}</strong>
                <span>有效支持授权</span>
              </article>
            </section>
            <div className="overview-grid">
              <section className="overview-card">
                <header>
                  <div>
                    <small>待办优先</small>
                    <h2>今天需要处理</h2>
                  </div>
                  <button onClick={() => setActiveView("services")}>
                    进入服务审核
                  </button>
                </header>
                {operationTasks.filter(
                  (task) =>
                    task.status === "PENDING_REVIEW" ||
                    task.status === "RETURNED",
                ).length ? (
                  operationTasks
                    .filter(
                      (task) =>
                        task.status === "PENDING_REVIEW" ||
                        task.status === "RETURNED",
                    )
                    .map((task) => (
                      <button
                        className="todo-row"
                        key={task.id}
                        type="button"
                        onClick={() => {
                          setReviewFilter(task.status === "RETURNED" ? "RETURNED" : "PENDING_REVIEW");
                          setActiveView("services");
                        }}
                      >
                        <div>
                          <strong>{task.elderName}</strong>
                          <span>
                            {task.serviceItems.join("、")} · 第{task.revision}版
                          </span>
                        </div>
                        <mark
                          data-status={
                            task.status === "RETURNED" ? "待修改" : "待审核"
                          }
                        >
                          {task.status === "RETURNED" ? "待员工修改" : "待审核"}
                        </mark>
                        <ChevronRight size={16} />
                      </button>
                    ))
                ) : (
                  <p className="table-message">当前没有紧急待办。</p>
                )}
              </section>
              <section className="overview-card">
                <header>
                  <div>
                    <small>租户状态</small>
                    <h2>容量与有效期</h2>
                  </div>
                </header>
                <dl>
                  <div>
                    <dt>机构状态</dt>
                    <dd>
                      {operationOverview
                        ? (tenantStatusLabels[
                            operationOverview.tenant
                              .status as keyof typeof tenantStatusLabels
                          ] ?? "未知")
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>有效期</dt>
                    <dd>{operationOverview?.tenant.validUntil ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>当前套餐</dt>
                    <dd>{operationOverview?.tenant.subscription.planName ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>容量</dt>
                    <dd>
                      {operationOverview?.tenant.usagePercent ?? 0}% /{" "}
                      {operationOverview?.tenant.capacityMb ?? 0} MB
                    </dd>
                  </div>
                </dl>
                <p className="privacy-note">
                  平台端只能调整机构元数据，默认不能查看这里的老人和服务正文。
                </p>
              </section>
            </div>
          </>
        ) : null}
        {activeView === "elders" ? (
          <>
            <header className="topline">
              <div>
                <p>基础资料与业务关联</p>
                <h1>老人档案</h1>
              </div>
              <button
                className="primary-action"
                onClick={() => setIsCreateElderOpen(true)}
              >
                新建档案
              </button>
            </header>
            <div className="filter-row">
              <label className="search-field">
                <Search size={18} />
                <input placeholder="姓名、档案号或联系人" />
              </label>
            </div>
            <section className="data-region">
              <div className="table-heading table-grid">
                <span>老人 / 档案</span>
                <span>主联系人</span>
                <span>服务形态</span>
                <span>关联进度</span>
                <span>状态</span>
              </div>
              {isLoading ? <p className="table-message">正在读取……</p> : null}
              {elders.map((elder) => (
                <button
                  className="table-row table-grid"
                  key={elder.id}
                  onClick={() => void openElderArchive(elder)}
                >
                  <span className="elder-name">
                    <strong>{elder.displayName}</strong>
                    <small>{elder.archiveNo}</small>
                  </span>
                  <span>
                    {elder.primaryContactName} ·{" "}
                    {elder.primaryContactPhoneMasked}
                  </span>
                  <span>{serviceModeLabels[elder.serviceMode]}</span>
                  <span>
                    {elder.completedRecords} / {elder.minimumRecords}
                  </span>
                  <span>
                    <mark data-status={statusLabels[elder.status]}>
                      {statusLabels[elder.status]}
                    </mark>
                  </span>
                </button>
              ))}
            </section>
          </>
        ) : null}

        {activeView === "services" ? (
          <>
            <header className="topline">
              <div>
                <p>员工提交记录与审核结果</p>
                <h1>服务审核</h1>
              </div>
            </header>
            <div
              className="review-filter"
              role="tablist"
              aria-label="服务审核筛选"
            >
              <button
                className={reviewFilter === "PENDING_REVIEW" ? "active" : ""}
                onClick={() => setReviewFilter("PENDING_REVIEW")}
              >
                待审核（
                {
                  operationTasks.filter(
                    (task) => task.status === "PENDING_REVIEW",
                  ).length
                }
                ）
              </button>
              <button
                className={reviewFilter === "RETURNED" ? "active" : ""}
                onClick={() => setReviewFilter("RETURNED")}
              >
                待员工修改（
                {
                  operationTasks.filter((task) => task.status === "RETURNED")
                    .length
                }
                ）
              </button>
              <button
                className={reviewFilter === "ALL" ? "active" : ""}
                onClick={() => setReviewFilter("ALL")}
              >
                全部记录
              </button>
            </div>
            <section className="review-list">
              {operationTasks
                .filter(
                  (task) =>
                    reviewFilter === "ALL" || task.status === reviewFilter,
                )
                .map((task) => (
                  <article className="review-card" key={task.id}>
                    <header>
                      <div>
                        <strong>{task.elderName}</strong>
                        <small>{task.serviceItems.join("、")}</small>
                      </div>
                      <mark
                        data-status={
                          task.status === "RETURNED"
                            ? "已退回"
                            : task.status === "PENDING_REVIEW"
                              ? "待审核"
                              : "服务中"
                        }
                      >
                        {task.status === "NOT_STARTED"
                          ? "待开始"
                          : task.status === "IN_PROGRESS"
                            ? "执行中"
                            : task.status === "PENDING_REVIEW"
                              ? "待审核"
                              : task.status === "RETURNED"
                                ? "待修改"
                                : "已完成"}
                      </mark>
                    </header>
                    <div className="review-meta">
                      <span>负责人 {task.responsibleName || "未指定"}</span>
                      <span>
                        参与人员{" "}
                        {(task.participantNames || []).join("、") || "无"}
                      </span>
                      <span>{task.stageProgress}/3 阶段</span>
                      <span>第 {task.revision} 版</span>
                    </div>
                    {task.returnReason ? (
                      <div className="return-reason">
                        <strong>待修改内容</strong>
                        {(task.returnIssues?.length
                          ? task.returnIssues
                          : [{ stage: "AFTER", fieldLabel: "阶段记录", reason: task.returnReason, resolved: false }]
                        ).map((issue, index) => (
                          <span key={`${issue.fieldLabel}-${index}`}>
                            {issue.stage === "BEFORE" ? "服务前" : issue.stage === "DURING" ? "服务中" : "服务后"} · {issue.fieldLabel}：{issue.reason}
                            {issue.resolved ? "（员工已修改）" : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="stage-audit-grid">
                      {(["BEFORE", "DURING", "AFTER"] as const).map((stage) => (
                        <section key={stage}>
                          <strong>
                            {stage === "BEFORE"
                              ? "服务前"
                              : stage === "DURING"
                                ? "服务中"
                                : "服务后"}
                          </strong>
                          <p>{task.stages[stage]?.note || "尚未填写"}</p>
                          <small>
                            {task.stages[stage]?.evidence?.length ?? 0} 张图片 ·{" "}
                            {task.stages[stage]?.locationStatus === "DENIED"
                              ? "未取得定位"
                              : task.stages[stage]
                                ? "位置已记录"
                                : "尚未记录位置"}
                          </small>
                        </section>
                      ))}
                    </div>
                    {task.customerFeedback ? (
                      <section className="customer-feedback-review">
                        <header><strong>客户反馈</strong><span>{task.customerFeedback.evaluatorType === "FAMILY" ? `家属或监护人 · ${task.customerFeedback.relationship || "关系未填"}` : "老人本人"}</span></header>
                        <div className="feedback-review-grid">
                          <span>满意度：{{ VERY_SATISFIED: "非常满意", SATISFIED: "满意", AVERAGE: "一般", DISSATISFIED: "不满意" }[task.customerFeedback.satisfaction] || "未选择"}</span>
                          <span>反馈材料：{task.customerFeedback.mediaIds.length} 份</span>
                          <span>标签：{task.customerFeedback.tags.join("、") || "未选择"}</span>
                        </div>
                        {task.customerFeedback.text ? <p>{task.customerFeedback.text}</p> : null}
                        {task.customerFeedback.refusalReason ? <p className="feedback-refusal">无法评价或拒绝原因：{task.customerFeedback.refusalReason}</p> : null}
                        {task.customerFeedback.media?.length ? (
                          <div className="feedback-materials">
                            {task.customerFeedback.media.map((item) => item.mediaType === "AUDIO" ? (
                              <audio key={item.id} controls preload="none" src={item.dataUrl} />
                            ) : (
                              <a key={item.id} href={item.dataUrl} target="_blank" rel="noreferrer" title={item.mediaType === "SIGNATURE" ? "查看服务确认签名" : "查看反馈照片"}>
                                <img src={item.dataUrl} alt={item.mediaType === "SIGNATURE" ? "服务确认签名" : item.fileName || "反馈照片"} />
                                <span>{item.mediaType === "SIGNATURE" ? "服务确认签名" : "反馈照片"}</span>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                    {(task.history?.length ?? 0) > 0 ? (
                      <details className="task-history">
                        <summary>查看处理记录（{task.history?.length}）</summary>
                        <ol>
                          {task.history?.map((entry, index) => (
                            <li key={`${entry.createdAt}-${index}`}>
                              <time>{new Intl.DateTimeFormat("zh-CN", {
                                timeZone: "Asia/Shanghai",
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(entry.createdAt))}</time>
                              <span>
                                {entry.status === "RETURNED"
                                  ? "退回修改"
                                  : entry.status === "APPROVED"
                                    ? "审核通过"
                                    : entry.status === "PENDING_REVIEW"
                                      ? "提交审核"
                                      : "更新服务记录"}
                                · 第 {entry.revision} 版
                              </span>
                              {entry.reason ? <small>{entry.reason}</small> : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    {task.status === "PENDING_REVIEW" ? (
                      <div className="review-actions">
                        <div className="review-targets">
                          <label>
                            <span>退回阶段</span>
                            <select
                              value={reviewStage[task.id] || "AFTER"}
                              onChange={(event) =>
                                {
                                  setReviewStage((current) => ({
                                    ...current,
                                    [task.id]: event.target.value as "BEFORE" | "DURING" | "AFTER",
                                  }));
                                  setReviewField((current) => ({
                                    ...current,
                                    [task.id]: "",
                                  }));
                                }
                              }
                            >
                              <option value="BEFORE">服务前</option>
                              <option value="DURING">服务中</option>
                              <option value="AFTER">服务后</option>
                            </select>
                          </label>
                          <label>
                            <span>具体内容</span>
                            <select
                              value={reviewField[task.id] || ""}
                              onChange={(event) =>
                                setReviewField((current) => ({
                                  ...current,
                                  [task.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">阶段整体记录</option>
                              {(task.templateSnapshot?.fields || [])
                                .filter(
                                  (field) =>
                                    (field.evidenceStage || "DURING") ===
                                    (reviewStage[task.id] || "AFTER"),
                                )
                                .map((field) => (
                                  <option value={field.id} key={field.id}>{field.label}</option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <textarea
                          value={reviewReason[task.id] || ""}
                          onChange={(event) =>
                            setReviewReason((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                          placeholder="说明需要修改什么，例如：补充本次服务完成情况"
                        />
                        <button
                          onClick={() =>
                            void reviewOperationTask(task.id, "RETURN")
                          }
                        >
                          退回修改
                        </button>
                        <button
                          className="primary-action"
                          onClick={() =>
                            void reviewOperationTask(task.id, "APPROVE")
                          }
                        >
                          审核通过
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              {!operationTasks.some(
                (task) =>
                  reviewFilter === "ALL" || task.status === reviewFilter,
              ) ? (
                <p className="table-message">当前筛选下没有服务记录。</p>
              ) : null}
            </section>
          </>
        ) : null}

        {activeView === "support" ? (
          <>
            <header className="topline">
              <div>
                <p>最小范围、限时、完整审计</p>
                <h1>临时支持授权</h1>
              </div>
            </header>
            <div className="support-grid">
              <form className="support-form" onSubmit={createSupportGrant}>
                <h2>发起授权</h2>
                <label>
                  授权原因
                  <input
                    name="reason"
                    required
                    placeholder="例如：服务任务提交异常排查"
                  />
                </label>
                <label>
                  授权范围
                  <select name="scope">
                    <option>服务任务摘要</option>
                    <option>指定任务只读</option>
                    <option>系统配置只读</option>
                  </select>
                </label>
                <label>
                  有效时长
                  <select name="durationHours" defaultValue="4">
                    <option value="1">1小时</option>
                    <option value="4">4小时（默认）</option>
                    <option value="8">8小时</option>
                    <option value="24">24小时（上限）</option>
                  </select>
                </label>
                <label className="download-check">
                  <input type="checkbox" name="allowDownload" />
                  允许下载授权范围内文件
                </label>
                <button className="primary-action">创建授权</button>
              </form>
              <section className="grant-list">
                <h2>授权记录</h2>
                {supportGrants.length ? (
                  supportGrants.map((grant) => (
                    <article key={grant.id}>
                      <div>
                        <strong>{grant.reason}</strong>
                        <span>
                          {grant.scope} · 至 {formatChinaTime(grant.expiresAt)}
                        </span>
                      </div>
                      <mark>{grant.active ? "有效" : "已失效"}</mark>
                      {grant.active ? (
                        <button
                          onClick={() => void revokeSupportGrant(grant.id)}
                        >
                          提前撤回
                        </button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="table-message">尚无授权记录。</p>
                )}
              </section>
            </div>
          </>
        ) : null}

        {activeView === "qualifications" && formWorkspace ? (
          <>
            <header className="topline">
              <div>
                <p>专业服务启用条件</p>
                <h1>机构资质</h1>
              </div>
            </header>
            <section className="qualification-page">
              <div className="qualification-page-intro">
                <BadgeCheck size={22} />
                <div>
                  <h2>上传材料后由平台完成审核</h2>
                  <p>机构只能提交材料和查看结果，不能自行修改审核状态。审核通过后，相关专业服务才可启用。</p>
                </div>
              </div>
              <div className="qualification-page-list">
                {formWorkspace!.qualifications.map((item) => (
                  <article key={item.code}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.mockDocumentName || "尚未上传材料"}</span>
                      {item.rejectionReason ? <span className="qualification-reason">退回原因：{item.rejectionReason}</span> : null}
                    </div>
                    <div className="qualification-actions">
                      <mark data-tone={item.status}>
                        {item.status === "APPROVED" ? "审核通过" : item.status === "PENDING" ? "待平台审核" : item.status === "REJECTED" ? "已退回" : item.status === "EXPIRED" ? "已过期" : item.uploadStatus === "UPLOADED" ? "已上传，待提交" : "未上传"}
                      </mark>
                      <label className="qualification-upload">
                        选择文件
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadQualification(item.code, file.name);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!item.mockDocumentName || item.status === "PENDING" || item.status === "APPROVED"}
                        onClick={() => void submitQualification(item.code)}
                      >
                        提交审核
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeView === "service-config" && formWorkspace ? (
          <ServiceFormDesigner
            workspace={formWorkspace}
            busy={isSaving}
            onChange={setFormWorkspace}
            onSave={saveFormTemplate}
            onPublish={publishFormTemplate}
          />
        ) : null}

        {activeView === "help" ? <MerchantHelpCenter /> : null}

        {(
          [
            "organization",
            "performance",
            "performance-management",
            "relationships",
            "tasks",
            "service-items",
            "contracts",
            "subsidies",
            "promotion",
            "food",
            "archives",
            "settings",
          ] as BusinessView[]
        ).includes(activeView as BusinessView) ? (
          <BusinessModulePage
            view={activeView as BusinessView}
            data={businessData}
            elders={elders}
            serviceCategories={config?.categories ?? []}
            serviceRules={config?.rules ?? {
              beforeNoteRequired: false,
              duringNoteRequired: false,
              afterNoteRequired: false,
              resultSummaryRequired: false,
              evidenceEnabled: true,
              evidenceRequired: false,
            }}
            tasks={operationTasks}
            reload={async () => {
              await Promise.all([loadBusiness(), loadOperations(), loadConfig()]);
            }}
            notify={setNotice}
            fail={setPageError}
          />
        ) : null}

        {notice ? <p className="save-notice">{notice}</p> : null}
        {pageError ? <p className="load-error">{pageError}</p> : null}
      </section>

      {["elders", "services", "support"].includes(activeView) ? (
        <aside className="context-panel">
          <h2>
            {activeView === "elders"
              ? "档案说明"
              : activeView === "services"
                ? "审核范围"
                : "授权边界"}
          </h2>
          <p>
            {activeView === "elders"
              ? "档案仅保存基础资料和自动关联结果，不能从这里修改服务状态。"
              : activeView === "services"
                ? "任务由服务计划与派单建立；员工完成阶段记录后，管理人员在这里审核或退回。"
                : "机构必须明确原因、范围与期限；授权撤回或到期后平台访问立即失效。"}
          </p>
        </aside>
      ) : null}

      {isCreateElderOpen ? (
        <Drawer
          title="建立老人基础档案"
          eyebrow="基础档案"
          onClose={() => setIsCreateElderOpen(false)}
        >
          <form className="drawer-form" onSubmit={createElder}>
            <label>
              <span>老人姓名</span>
              <input name="elderName" />
            </label>
            <label>
              <span>主联系人</span>
              <input name="contactName" />
            </label>
            <label>
              <span>虚拟手机号</span>
              <input name="contactPhone" maxLength={11} />
            </label>
            <label>
              <span>初始服务形态</span>
              <select name="serviceMode" defaultValue="PERIODIC_HOME_VISIT">
                {Object.entries(serviceModeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="drawer-actions">
              <button type="button" onClick={() => setIsCreateElderOpen(false)}>
                取消
              </button>
              <button className="primary-action" disabled={isSaving}>
                保存基础档案
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {selectedElder ? (
        <Drawer
          title={`${selectedElder.displayName} · 基础档案`}
          eyebrow={selectedElder.archiveNo}
          onClose={() => setSelectedElder(null)}
        >
          <dl className="profile-details">
            <div>
              <dt>主要联系人</dt>
              <dd>{selectedElder.primaryContactName}</dd>
            </div>
            <div>
              <dt>联系电话</dt>
              <dd>{selectedElder.primaryContactPhoneMasked}</dd>
            </div>
            <div>
              <dt>初始服务形态</dt>
              <dd>{serviceModeLabels[selectedElder.serviceMode]}</dd>
            </div>
          </dl>
          <section className="linked-service-summary">
            <h3>自动关联的服务周期</h3>
            {elderPeriods.map((period) => (
              <article key={period.id}>
                <strong>
                  {period.yearMonth} · 第{period.revision}版
                </strong>
                <span>
                  {period.completedRecordCount}/{period.minimumRecordCount}条 ·{" "}
                  {periodStatusLabels[period.status]}
                </span>
              </article>
            ))}
          </section>
          <p className="drawer-warning">
            此处只读。服务状态、打卡和证据来自服务工作台或员工小程序，不能在档案内手工修改。
          </p>
        </Drawer>
      ) : null}

      {isCreateOrderOpen ? (
        <Drawer
          title="建立月度服务工单"
          eyebrow="服务记录模块"
          onClose={() => setIsCreateOrderOpen(false)}
        >
          <form className="drawer-form" onSubmit={createOrder}>
            <label>
              <span>服务老人</span>
              <select name="elderId" defaultValue="">
                <option value="" disabled>
                  请选择
                </option>
                {elders.map((elder) => (
                  <option value={elder.id} key={elder.id}>
                    {elder.displayName} · {elder.archiveNo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>核销归属月份</span>
              <input type="month" name="yearMonth" defaultValue="2026-08" />
            </label>
            <label>
              <span>服务形态</span>
              <select name="serviceMode" defaultValue="PERIODIC_HOME_VISIT">
                {Object.entries(serviceModeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="amount-grid">
              <label>
                <span>自费金额</span>
                <input
                  type="number"
                  name="selfPaidYuan"
                  min="0"
                  defaultValue="0"
                />
              </label>
              <label>
                <span>消费券金额</span>
                <input
                  type="number"
                  name="voucherYuan"
                  min="0"
                  defaultValue="0"
                />
              </label>
            </div>
            <label>
              <span>最低记录数</span>
              <input
                type="number"
                name="minimumRecordCount"
                min="1"
                defaultValue="4"
              />
            </label>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="drawer-actions">
              <button type="button" onClick={() => setIsCreateOrderOpen(false)}>
                取消
              </button>
              <button className="primary-action" disabled={isSaving}>
                建立服务工单
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {selectedOrder && config && formWorkspace ? (
        <Drawer
          title={`${selectedOrder.elder.displayName} · ${selectedOrder.period.yearMonth}`}
          eyebrow="服务记录只读核查"
          wide
          onClose={() => {
            setSelectedOrder(null);
          }}
        >
          <section className="record-read-list">
            <h3>已关联记录</h3>
            {records.length === 0 ? (
              <p>尚无记录。</p>
            ) : (
              records.map((record) => (
                <article className="service-record-card" key={record.id}>
                  <header>
                    <strong>{formatChinaTime(record.startedAt)}</strong>
                    <mark>草稿</mark>
                  </header>
                  <p>{record.log || "未填写结果总结"}</p>
                  <small>
                    负责人：
                    {config.staff.find(
                      (staff) => staff.id === record.responsibleId,
                    )?.displayName ?? record.responsibleId}
                  </small>
                  <small>
                    人员：
                    {record.participantIds
                      .map(
                        (id) =>
                          config.staff.find((staff) => staff.id === id)
                            ?.displayName ?? id,
                      )
                      .join("、")}
                  </small>
                  <small>
                    项目：
                    {record.serviceItemVersionIds
                      .map(
                        (id) =>
                          config.categories
                            .flatMap((category) => category.items)
                            .find((item) => item.id === id)?.label ?? id,
                      )
                      .join("、")}
                  </small>
                  {record.answers?.length ? (
                    <dl className="record-answer-list">
                      {record.answers.map((answer) => {
                        const field = (
                          record.templateSnapshot ??
                          formWorkspace.publishedTemplate
                        ).fields.find((item) => item.id === answer.fieldId);
                        if (!field || field.type === "IMAGE") return null;
                        return (
                          <div key={answer.fieldId}>
                            <dt>{field.label}</dt>
                            <dd>{formatDynamicAnswer(field, answer)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                  <div className="evidence-strip">
                    {[...(evidenceByRecord[record.id] ?? [])]
                      .sort(
                        (left, right) =>
                          ["BEFORE", "DURING", "AFTER"].indexOf(left.stage) -
                          ["BEFORE", "DURING", "AFTER"].indexOf(right.stage),
                      )
                      .map((evidence) => (
                        <figure key={evidence.id}>
                          <img src={evidence.dataUrl} alt={evidence.fileName} />
                          <figcaption>
                            {evidence.stage === "BEFORE"
                              ? "服务前"
                              : evidence.stage === "DURING"
                                ? "服务中"
                                : "服务后"}
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </article>
              ))
            )}
          </section>
          <p className="record-readonly-note">
            员工阶段记录只能在微信小程序填写；机构后台只负责核查、审核和退回。
          </p>
        </Drawer>
      ) : null}
    </main>
  );
}

function Drawer({
  title,
  eyebrow,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="drawer-backdrop">
      <section
        className={wide ? "create-drawer execution-drawer" : "create-drawer"}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
