import {
  ArchiveRestore,
  ChartNoAxesColumnIncreasing,
  Calculator,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CalendarDays,
  FileDown,
  FileSignature,
  Image,
  Plus,
  ShieldAlert,
  Utensils,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

function moveEntry<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type BusinessView =
  | "organization"
  | "performance"
  | "performance-management"
  | "planning"
  | "relationships"
  | "tasks"
  | "service-items"
  | "contracts"
  | "subsidies"
  | "promotion"
  | "food"
  | "archives"
  | "settings";
export type BusinessData = {
  overview: Record<string, number>;
  departments: Array<Record<string, unknown>>;
  staff: Array<Record<string, unknown>>;
  performance: Array<Record<string, unknown>>;
  performanceTemplates: Record<string, unknown>;
  performanceSchemes: Array<Record<string, unknown>>;
  sales: Array<Record<string, unknown>>;
  performanceStatements: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  subsidies: Array<Record<string, unknown>>;
  promotion: Array<Record<string, unknown>>;
  food: Array<Record<string, unknown>>;
  engagements: Array<Record<string, unknown>>;
  archives: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
};

type Props = {
  view: BusinessView;
  data: BusinessData;
  elders: Array<{ displayName: string; archiveNo: string }>;
  serviceCategories: Array<{
    id: string;
    label: string;
    enabled?: boolean;
    order?: number;
    items: Array<{ id: string; label: string; enabled?: boolean; order?: number }>;
  }>;
  serviceRules: Record<string, boolean>;
  tasks: Array<{
    id: string;
    elderName: string;
    scheduledAt: string;
    status: string;
    serviceItems: string[];
    stageProgress: number;
  }>;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  fail: (message: string) => void;
};

const apiBase =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const headers = {
  "content-type": "application/json",
  "x-dev-tenant-id": "tenant-lanzhou-pilot",
  "x-dev-role": "TENANT_ADMIN",
};
const statusLabels: Record<string, string> = {
  ACTIVE: "使用中",
  DRAFT: "草稿",
  PENDING_SIGN: "待签署",
  SIGNED: "已签署",
  ARCHIVED: "已归档",
  READY: "材料已生成",
  SUBMITTED: "已报送",
  ACCEPTED: "已通过",
  RETURNED: "待修改",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "未采用",
  RECORDED: "已登记",
  VERIFIED: "已复核",
  NOT_REQUESTED: "未申请",
  HOLD: "保全中",
  NOT_STARTED: "待开始",
  IN_PROGRESS: "执行中",
  PENDING_REVIEW: "待审核",
  TRIAL: "试用期",
  READ_ONLY: "只读",
  PUBLISHED: "已发布",
  CONFIRMED: "已确认",
  CANCELED: "已取消",
};
const modeLabels: Record<string, string> = {
  PERIODIC_HOME_VISIT: "定期上门",
  APPOINTMENT_HOME_VISIT: "预约上门",
  DAY_CARE: "日托服务",
  RESIDENTIAL: "机构常住",
  SHORT_TERM_LIVE_IN: "短期住家护工",
  LONG_TERM_LIVE_IN: "长期住家护工",
};

function formatTaskTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMoney(cents: unknown): string {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDateTime(value: unknown): string {
  if (!value) return "未记录";
  return new Date(String(value)).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function api(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`${apiBase}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as {
    data?: unknown;
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join("；")
        : payload.message || "操作失败",
    );
  return payload.data;
}

export function BusinessModulePage({
  view,
  data,
  elders,
  serviceCategories,
  serviceRules,
  tasks,
  reload,
  notify,
  fail,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [selectedServiceCategoryIds, setSelectedServiceCategoryIds] = useState<
    string[]
  >([]);
  const [catalogDraft, setCatalogDraft] = useState(serviceCategories);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState("");
  const [performanceMonth, setPerformanceMonth] = useState(
    String(data.performance[0]?.month || new Date().toISOString().slice(0, 7)),
  );
  const [performanceRows, setPerformanceRows] = useState(data.performance);
  const [performanceSales, setPerformanceSales] = useState(data.sales);
  const [performanceStatements, setPerformanceStatements] = useState(
    data.performanceStatements,
  );
  const [selectedPointsTemplate, setSelectedPointsTemplate] = useState("");
  const [pointsRuleDraft, setPointsRuleDraft] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [pointsSchemeDepartments, setPointsSchemeDepartments] = useState<string[]>([]);
  useEffect(() => setCatalogDraft(serviceCategories), [serviceCategories]);
  useEffect(() => setPerformanceRows(data.performance), [data.performance]);
  useEffect(() => setPerformanceSales(data.sales), [data.sales]);
  useEffect(
    () => setPerformanceStatements(data.performanceStatements),
    [data.performanceStatements],
  );
  const recommendedPerformanceTemplates =
    (data.performanceTemplates.templates as
      | Array<Record<string, unknown>>
      | undefined) || [];
  useEffect(() => {
    if (!recommendedPerformanceTemplates.length || selectedPointsTemplate)
      return;
    const first = recommendedPerformanceTemplates[0];
    setSelectedPointsTemplate(String(first.code));
    setPointsRuleDraft(
      (first.rules as Array<Record<string, unknown>>).map((rule) => ({
        ...rule,
      })),
    );
    setPointsSchemeDepartments(
      (first.recommendedDepartments as string[] | undefined) || [],
    );
  }, [recommendedPerformanceTemplates, selectedPointsTemplate]);

  async function loadPerformanceMonth(month: string) {
    setBusy(true);
    fail("");
    try {
      const [workload, sales, statements] = await Promise.all([
        api(`/organization/staff-performance?month=${month}`),
        api(`/organization/sales-records?month=${month}`),
        api(`/organization/performance-statements?month=${month}`),
      ]);
      setPerformanceRows(workload as BusinessData["performance"]);
      setPerformanceSales(sales as BusinessData["sales"]);
      setPerformanceStatements(
        statements as BusinessData["performanceStatements"],
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : "绩效数据加载失败");
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    path: string,
    values: Record<string, unknown>,
    success: string,
  ) {
    setBusy(true);
    fail("");
    try {
      await api(path, values);
      await reload();
      notify(success);
    } catch (error) {
      fail(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  function formValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }

  if (view === "organization")
    return (
      <Page title="组织与员工" lead="维护门店部门、员工岗位和跨部门任职关系。">
        <div className="business-columns">
          <DataPanel title="部门与负责人" icon={<UsersRound />}>
            {data.departments.map((row) => (
              <Row
                key={String(row.id)}
                title={String(row.name)}
                meta={`${row.leader} · ${row.memberCount}人`}
                status={String(row.status)}
              />
            ))}
          </DataPanel>
          <DataPanel title="员工档案" icon={<BadgeCheck />}>
            {data.staff.map((row) => (
              <Row
                key={String(row.id)}
                title={String(row.name)}
                meta={`${row.role} · ${(row.departments as string[]).join("、")} · ${row.phone} · ${row.qualification} · ${row.joinedAt}入职`}
                status={String(row.status)}
              />
            ))}
          </DataPanel>
        </div>
        <div className="business-columns editors">
          <Editor title="新建部门">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                void submit(
                  "/organization/departments",
                  { name: f.get("name"), leader: f.get("leader") },
                  "部门已建立。",
                );
              }}
            >
              <Field label="部门名称" name="name" />
              <Field label="负责人" name="leader" />
              <Submit busy={busy} />
            </form>
          </Editor>
          <Editor title="新增员工">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                void submit(
                  "/organization/staff-directory",
                  {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    role: f.get("role"),
                    departments: f.getAll("departments"),
                    qualification: f.get("qualification"),
                  },
                  "员工档案已建立。",
                );
              }}
            >
              <Field label="姓名" name="name" />
              <Field label="联系电话" name="phone" />
              <Field label="岗位" name="role" />
              <label>
                <span>所属部门</span>
                <select name="departments" multiple required>
                  {data.departments.map((row) => (
                    <option key={String(row.id)}>{String(row.name)}</option>
                  ))}
                </select>
              </label>
              <Field label="资质说明" name="qualification" />
              <Submit busy={busy} />
            </form>
          </Editor>
        </div>
      </Page>
    );

  if (view === "performance") {
    const rows = performanceRows;
    const totalApproved = rows.reduce(
      (total, row) => total + Number(row.approvedTasks || 0),
      0,
    );
    const totalResponsible = rows.reduce(
      (total, row) => total + Number(row.responsibleApproved || 0),
      0,
    );
    const totalCollaborative = rows.reduce(
      (total, row) => total + Number(row.collaborativeApproved || 0),
      0,
    );
    return (
      <Page
        title="工作量与质量"
        lead="展示员工参与、完成和质量事实，为绩效计算提供依据，但不直接决定积分或奖金。"
      >
        <div className="performance-toolbar">
          <label>
            <span>统计月份</span>
            <input
              type="month"
              value={performanceMonth}
              onChange={(event) => setPerformanceMonth(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !performanceMonth}
            onClick={() => void loadPerformanceMonth(performanceMonth)}
          >
            {busy ? "正在查询…" : "查询"}
          </button>
        </div>
        <section className="performance-summary">
          <article><span>在册员工</span><strong>{rows.length}</strong></article>
          <article><span>审核通过人次</span><strong>{totalApproved}</strong></article>
          <article><span>负责人完成</span><strong>{totalResponsible}</strong></article>
          <article><span>协作完成</span><strong>{totalCollaborative}</strong></article>
        </section>
        <div className="performance-boundary">
          “涉及退回”仅表示该员工参与的任务曾被退回，不能据此自动归责或扣款。需要计算积分时，请进入“绩效管理”选择方案并生成月度绩效单。
        </div>
        <section className="performance-table">
          <div className="performance-head">
            <span>员工</span><span>参与任务</span><span>通过</span><span>负责人完成</span><span>协作完成</span><span>涉及退回</span><span>服务天数</span>
          </div>
          {rows.map((row) => (
            <details className="performance-row" key={String(row.staffId)}>
              <summary>
                <span><strong>{String(row.name)}</strong><small>{String(row.role)} · {(row.departments as string[]).join("、")}</small></span>
                <span>{String(row.assignedTasks)}</span>
                <span>{String(row.approvedTasks)}</span>
                <span>{String(row.responsibleApproved)}</span>
                <span>{String(row.collaborativeApproved)}</span>
                <span>{String(row.returnedTasks)}</span>
                <span>{String(row.serviceDays)}</span>
              </summary>
              <div className="daily-performance">
                <header><ChartNoAxesColumnIncreasing size={17} /><strong>{String(row.month)} 每日任务</strong></header>
                {(row.daily as Array<Record<string, unknown>>).length ? (
                  (row.daily as Array<Record<string, unknown>>).map((day) => (
                    <div key={String(day.date)}>
                      <span>{String(day.date)}</span>
                      <span>参与 {String(day.assigned)} 单</span>
                      <span>负责人 {String(day.responsible)} 单</span>
                      <span>协作 {String(day.collaborative)} 单</span>
                      <span>通过 {String(day.approved)} 单</span>
                    </div>
                  ))
                ) : <p>本月没有任务记录。</p>}
              </div>
            </details>
          ))}
        </section>
      </Page>
    );
  }

  if (view === "performance-management") {
    const currentScheme =
      data.performanceSchemes.find(
        (scheme) =>
          String(scheme.effectiveFrom) <= `${performanceMonth}-31`,
      ) || data.performanceSchemes[0];
    const statementTotal = performanceStatements.reduce(
      (sum, row) => sum + Number(row.totalPoints || 0),
      0,
    );
    const confirmedSales = performanceSales.filter(
      (row) => row.status === "CONFIRMED",
    );
    return (
      <Page
        title="绩效管理"
        lead="通过可配置积分方案自动解释工作量和销售事实，生成可核对、可调整、可锁定的月度绩效单。"
      >
        <section className="points-overview">
          <article>
            <span>当前方案</span>
            <strong>{String(currentScheme?.name || "尚未发布")}</strong>
            <small>
              {currentScheme
                ? `第${String(currentScheme.version)}版 · ${String(currentScheme.effectiveFrom)}生效`
                : "请选择推荐方案并发布"}
            </small>
          </article>
          <article>
            <span>{performanceMonth} 已确认销售</span>
            <strong>{confirmedSales.length} 单</strong>
            <small>
              {formatMoney(
                confirmedSales.reduce(
                  (sum, row) => sum + Number(row.amountCents || 0),
                  0,
                ),
              )}
            </small>
          </article>
          <article>
            <span>月度绩效单</span>
            <strong>{performanceStatements.length} 份</strong>
            <small>合计 {statementTotal} 分</small>
          </article>
        </section>

        <div className="points-workspace">
          <section className="points-card rules-card">
            <header>
              <div>
                <span>新版本配置</span>
                <h2>绩效规则表</h2>
              </div>
              <Calculator />
            </header>
            {currentScheme ? (
              <div className="active-rule-summary">
                <strong>当前生效规则</strong>
                <div>
                  {(currentScheme.rules as Array<Record<string, unknown>>)
                    .filter((rule) => rule.enabled)
                    .map((rule) => (
                      <span key={String(rule.id)}>
                        {String(rule.label)}：
                        {String(rule.unit).startsWith("每") ? "" : "每"}
                        {String(rule.unit)} {String(rule.pointsPerUnit)}分
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
            <div className="template-picker">
              <label>
                <span>从推荐方案开始</span>
                <select
                  value={selectedPointsTemplate}
                  onChange={(event) => {
                    const code = event.target.value;
                    const template = recommendedPerformanceTemplates.find(
                      (item) => String(item.code) === code,
                    );
                    setSelectedPointsTemplate(code);
                    setPointsRuleDraft(
                      template
                        ? (template.rules as Array<Record<string, unknown>>).map(
                            (rule) => ({ ...rule, enabled: Number(rule.pointsPerUnit) > 0 }),
                          )
                        : [],
                    );
                    setPointsSchemeDepartments(
                      (template?.recommendedDepartments as string[] | undefined) || [],
                    );
                  }}
                >
                  {recommendedPerformanceTemplates.map((template) => (
                    <option value={String(template.code)} key={String(template.code)}>
                      {String(template.name)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {String(
                  recommendedPerformanceTemplates.find(
                    (item) => String(item.code) === selectedPointsTemplate,
                  )?.description || "选择一个推荐方案后逐行调整。",
                )}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                const form = formValues(event);
                void submit(
                  "/organization/performance-schemes",
                  {
                    name: form.get("name"),
                    effectiveFrom: form.get("effectiveFrom"),
                    scopeDepartments: pointsSchemeDepartments,
                    rules: pointsRuleDraft,
                  },
                  "新的积分方案版本已发布，之后生成的绩效单将按生效日期选择规则。",
                );
              }}
            >
              <div className="scheme-meta-fields">
                <Field
                  key={selectedPointsTemplate}
                  label="方案名称"
                  name="name"
                  value={String(
                    recommendedPerformanceTemplates.find(
                      (item) => String(item.code) === selectedPointsTemplate,
                    )?.name || "门店积分方案",
                  )}
                />
                <Field
                  label="生效日期"
                  name="effectiveFrom"
                  type="date"
                  value={`${performanceMonth}-01`}
                />
              </div>
              <fieldset className="scheme-department-scope">
                <legend>适用部门</legend>
                <p>员工属于多个部门时，按其实际匹配的方案计算；同一任务不会重复计分。</p>
                <div>
                  {data.departments.map((department) => {
                    const name = String(department.name);
                    return (
                      <label key={name}>
                        <input
                          type="checkbox"
                          checked={pointsSchemeDepartments.includes(name)}
                          onChange={(event) =>
                            setPointsSchemeDepartments((current) =>
                              event.target.checked
                                ? [...new Set([...current, name])]
                                : current.filter((item) => item !== name),
                            )
                          }
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="points-rule-grid">
                <div className="points-rule-head">
                  <span>启用</span><span>指标来源</span><span>单位积分</span><span>公式预览</span>
                </div>
                {pointsRuleDraft.map((rule, index) => (
                  <div className="points-rule-row" key={String(rule.metricCode)}>
                    <input
                      type="checkbox"
                      checked={rule.enabled !== false && Number(rule.pointsPerUnit) > 0}
                      onChange={(event) =>
                        setPointsRuleDraft((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, enabled: event.target.checked }
                              : item,
                          ),
                        )
                      }
                      aria-label={`启用${String(rule.label)}`}
                    />
                    <span>
                      <strong>{String(rule.label)}</strong>
                      <small>{String(rule.unit)}</small>
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="0.5"
                      value={String(rule.pointsPerUnit)}
                      onChange={(event) =>
                        setPointsRuleDraft((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, pointsPerUnit: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                      aria-label={`${String(rule.label)}每单位积分`}
                    />
                    <code>
                      {rule.enabled === false
                        ? "不参与计算"
                        : `${String(rule.label)}数量 × ${String(rule.pointsPerUnit)}分`}
                    </code>
                  </div>
                ))}
              </div>
              <div className="scheme-publish-note">
                发布后不可覆盖；修改规则会产生新版本，历史绩效单继续使用原规则。
              </div>
              <Submit busy={busy} label="发布新版本" />
            </form>
          </section>

          <section className="points-card sales-card">
            <header>
              <div><span>销售事实</span><h2>养老产品销售登记</h2></div>
            </header>
            <form
              className="sales-entry-form"
              onSubmit={(event) => {
                const form = formValues(event);
                void submit(
                  "/organization/sales-records",
                  {
                    staffId: form.get("staffId"),
                    itemName: form.get("itemName"),
                    quantity: Number(form.get("quantity")),
                    amountCents: Math.round(Number(form.get("amountYuan")) * 100),
                    soldAt: form.get("soldAt"),
                  },
                  "销售记录已登记，确认后才会进入积分计算。",
                );
              }}
            >
              <label>
                <span>销售员工</span>
                <select name="staffId" required defaultValue="">
                  <option value="" disabled>请选择员工</option>
                  {data.staff.map((staff) => (
                    <option value={String(staff.id)} key={String(staff.id)}>
                      {String(staff.name)}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="产品或项目" name="itemName" />
              <Field label="数量" name="quantity" type="number" value="1" />
              <Field label="销售金额（元）" name="amountYuan" type="number" />
              <Field label="销售日期" name="soldAt" type="date" value={`${performanceMonth}-09`} />
              <Submit busy={busy} label="登记待确认" />
            </form>
            <div className="sales-record-list">
              {performanceSales.map((sale) => (
                <article key={String(sale.id)}>
                  <div>
                    <strong>{String(sale.itemName)}</strong>
                    <span>
                      {String(sale.staffName)} · {String(sale.quantity)}件 · {formatMoney(sale.amountCents)} · {String(sale.soldAt)}
                    </span>
                  </div>
                  <mark>
                    {sale.status === "PENDING"
                      ? "待确认"
                      : statusLabels[String(sale.status)] || String(sale.status)}
                  </mark>
                  {sale.status === "PENDING" ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => void submit(
                          `/organization/sales-records/${String(sale.id)}/action`,
                          { action: "CONFIRM" },
                          "销售记录已确认，将在下次绩效计算时计入。",
                        )}
                      >确认</button>
                      <button
                        type="button"
                        onClick={() => void submit(
                          `/organization/sales-records/${String(sale.id)}/action`,
                          { action: "CANCEL" },
                          "销售记录已取消，不会计入绩效。",
                        )}
                      >取消</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="points-card statements-card">
          <header>
            <div><span>月度核算</span><h2>员工绩效单</h2></div>
            <div className="statement-actions">
              <input
                type="month"
                aria-label="绩效月份"
                value={performanceMonth}
                onChange={(event) => setPerformanceMonth(event.target.value)}
              />
              <button type="button" onClick={() => void loadPerformanceMonth(performanceMonth)}>
                查询
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  fail("");
                  try {
                    const result = await api(
                      "/organization/performance-statements/calculate",
                      { month: performanceMonth },
                    );
                    setPerformanceStatements(
                      result as BusinessData["performanceStatements"],
                    );
                    notify("绩效单已按当前月份适用的方案自动计算，可展开核对明细。 ");
                  } catch (error) {
                    fail(error instanceof Error ? error.message : "绩效计算失败");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "正在计算…" : "重新计算"}
              </button>
            </div>
          </header>
          {performanceStatements.length ? (
            <div className="statement-list">
              {performanceStatements.map((statement) => (
                <details key={String(statement.id)}>
                  <summary>
                    <span><strong>{String(statement.staffName)}</strong><small>{String(statement.staffRole)}</small></span>
                    <span>基础 {String(statement.basePoints)} 分</span>
                    <span>调整 {Number(statement.adjustmentPoints) > 0 ? "+" : ""}{String(statement.adjustmentPoints)} 分</span>
                    <strong>{String(statement.totalPoints)} 分</strong>
                    <mark>{statusLabels[String(statement.status)] || String(statement.status)}</mark>
                  </summary>
                  <div className="statement-detail">
                    <p>采用“{String(statement.schemeName)}”第{String(statement.schemeVersion)}版，计算时间 {formatDateTime(statement.calculatedAt)}</p>
                    <div className="statement-lines">
                      {(statement.lines as Array<Record<string, unknown>>).map((line) => (
                        <div key={String(line.metricCode)}>
                          <span>{String(line.label)}</span>
                          <span>
                            {String(line.units)}
                            {line.metricCode === "SALE_AMOUNT_100"
                              ? " × 100元"
                              : ` ${String(line.unit)}`}
                          </span>
                          <span>× {String(line.pointsPerUnit)} 分</span>
                          <strong>{String(line.points)} 分</strong>
                        </div>
                      ))}
                    </div>
                    {(statement.adjustments as Array<Record<string, unknown>>).map((adjustment) => (
                      <p className="adjustment-record" key={String(adjustment.id)}>
                        调整 {Number(adjustment.points) > 0 ? "+" : ""}{String(adjustment.points)} 分：{String(adjustment.reason)}
                      </p>
                    ))}
                    {statement.status === "DRAFT" ? (
                      <div className="statement-review-actions">
                        <form
                          onSubmit={async (event) => {
                            const form = formValues(event);
                            setBusy(true);
                            fail("");
                            try {
                              await api(
                                `/organization/performance-statements/${String(statement.id)}/adjust`,
                                { points: Number(form.get("points")), reason: form.get("reason") },
                              );
                              await loadPerformanceMonth(performanceMonth);
                              notify("绩效调整已记录，原始业务数据没有被修改。 ");
                            } catch (error) {
                              fail(error instanceof Error ? error.message : "绩效调整失败");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <Field label="调整积分" name="points" type="number" />
                          <Field label="调整原因" name="reason" />
                          <Submit busy={busy} label="记录调整" />
                        </form>
                        <button
                          type="button"
                          className="primary-action"
                          onClick={async () => {
                            setBusy(true);
                            fail("");
                            try {
                              await api(
                                `/organization/performance-statements/${String(statement.id)}/confirm`,
                                {},
                              );
                              await loadPerformanceMonth(performanceMonth);
                              notify("绩效单已确认并锁定。 ");
                            } catch (error) {
                              fail(error instanceof Error ? error.message : "绩效单确认失败");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >确认并锁定</button>
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="business-empty">
              当前月份尚未生成绩效单。确认积分方案和销售记录后，点击“重新计算”。
            </div>
          )}
        </section>
      </Page>
    );
  }

  if (view === "relationships")
    return (
      <Page
        title="服务关系"
        lead="管理长期、定期或住家服务安排；具体执行仍通过服务任务留痕。"
      >
        <div className="workflow-page-grid">
          <DataPanel title="持续服务关系" icon={<CalendarDays />}>
            {data.engagements.length ? (
              data.engagements.map((row) => (
                <Row
                  key={String(row.id)}
                  title={`${row.elderName} · ${modeLabels[String(row.mode)] || row.mode}`}
                  meta={`${row.frequency} · 负责人 ${row.responsible} · ${row.startDate} 起`}
                  status={String(row.status)}
                />
              ))
            ) : (
              <p className="business-empty">尚未建立持续服务关系，可从右侧开始建立。</p>
            )}
          </DataPanel>
          <Editor title="建立服务关系">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                void submit(
                  "/organization/engagements",
                  {
                    elderName: f.get("elderName"),
                    mode: f.get("mode"),
                    startDate: f.get("startDate"),
                    frequency: f.get("frequency"),
                    responsible: f.get("responsible"),
                  },
                  "服务关系已建立，可继续派发具体任务。",
                );
              }}
            >
              <ElderSelect elders={elders} />
              <label>
                <span>服务形态</span>
                <select name="mode">
                  {Object.entries(modeLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <Field label="开始日期" name="startDate" type="date" />
              <Field label="服务频次" name="frequency" placeholder="例如：每周一次" />
              <label>
                <span>负责人</span>
                <select name="responsible" required defaultValue="">
                  <option value="" disabled>请选择负责人</option>
                  {data.staff.map((row) => (
                    <option value={String(row.name)} key={String(row.id)}>
                      {String(row.name)} · {String(row.role)}
                    </option>
                  ))}
                </select>
              </label>
              <Submit busy={busy} label="建立服务关系" />
            </form>
          </Editor>
        </div>
      </Page>
    );

  if (view === "tasks")
    return (
      <Page
        title="服务任务"
        lead="直接派发一次任务，或承接持续服务关系中的具体执行安排。"
      >
        <div className="workflow-page-grid">
          <DataPanel title="近期任务" icon={<UsersRound />}>
            {tasks.length ? (
              tasks.map((task) => (
                <Row
                  key={task.id}
                  title={`${task.elderName} · ${task.serviceItems.join("、")}`}
                  meta={`${formatTaskTime(task.scheduledAt)} · ${task.stageProgress}/3 阶段`}
                  status={task.status}
                />
              ))
            ) : (
              <p className="business-empty">当前没有服务任务，可从右侧直接派发。</p>
            )}
          </DataPanel>
          <Editor title="派发单次任务">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                const elder = elders.find((item) => item.displayName === f.get("elderName"));
                const serviceItems = f.getAll("serviceItems");
                if (!serviceItems.length) {
                  fail("请至少选择一个具体服务项目。");
                  return;
                }
                const responsibleId = String(f.get("responsibleId") || "");
                void submit(
                  "/organization/operations/tasks",
                  {
                    elderName: f.get("elderName"),
                    archiveNo: elder?.archiveNo,
                    scheduledAt: f.get("scheduledAt"),
                    serviceItems,
                    responsibleId,
                    participantIds: Array.from(
                      new Set(
                        f
                          .getAll("participantIds")
                          .map(String)
                          .filter((id) => id !== responsibleId),
                      ),
                    ).filter(Boolean),
                  },
                  "服务任务已派发，员工端将显示该任务。",
                );
              }}
            >
              <ElderSelect elders={elders} />
              <Field label="执行时间" name="scheduledAt" type="datetime-local" />
              <fieldset className="service-catalog-picker">
                <legend>本次服务项目</legend>
                <p>只展开本次涉及的大类，再选择具体项目。</p>
                {serviceCategories.filter((category) => category.enabled !== false).map((category) => {
                  const selected = selectedServiceCategoryIds.includes(category.id);
                  return (
                    <section key={category.id}>
                      <label className="category-toggle">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => setSelectedServiceCategoryIds((current) =>
                            event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id),
                          )}
                        />
                        <strong>{category.label}</strong>
                        <small>{category.items.filter((item) => item.enabled !== false).length} 项</small>
                      </label>
                      {selected ? (
                        <div className="service-item-options">
                          {category.items.filter((item) => item.enabled !== false).map((item) => (
                            <label key={item.id}>
                              <input type="checkbox" name="serviceItems" value={`${category.label}·${item.label}`} />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </fieldset>
              <label>
                <span>负责人</span>
                <select
                  name="responsibleId"
                  required
                  value={selectedResponsibleId}
                  onChange={(event) => setSelectedResponsibleId(event.target.value)}
                >
                  <option value="" disabled>请选择负责人</option>
                  {data.staff.map((row) => (
                    <option value={String(row.id)} key={String(row.id)}>{String(row.name)}</option>
                  ))}
                </select>
              </label>
              <fieldset className="people-picker">
                <legend>协作人员</legend>
                <p>负责人会自动加入任务；这里只选择其他协作人员。</p>
                <div>
                  {data.staff.map((row) => (
                    <label key={String(row.id)}>
                      <input
                        type="checkbox"
                        name="participantIds"
                        value={String(row.id)}
                        disabled={String(row.id) === selectedResponsibleId}
                      />
                      <span>{String(row.name)} · {String(row.role)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Submit busy={busy} label="派发任务" />
            </form>
          </Editor>
        </div>
      </Page>
    );

  if (view === "service-items") {
    const normalized = catalogDraft.map((category, categoryOrder) => ({
      ...category,
      enabled: category.enabled !== false,
      order: categoryOrder,
      items: category.items.map((item, itemOrder) => ({
        ...item,
        enabled: item.enabled !== false,
        order: itemOrder,
      })),
    }));
    return (
      <Page title="服务项目" lead="维护门店可提供的服务大类和具体项目；这里不配置员工填写字段。">
        <section className="catalog-editor">
          <header>
            <div>
              <h2>项目目录</h2>
              <p>停用项目只影响新任务，历史任务仍保留原名称。</p>
            </div>
            <button
              type="button"
              onClick={() => setCatalogDraft((current) => [
                ...current,
                { id: `category-${Date.now()}`, label: "新服务大类", enabled: true, order: current.length, items: [] },
              ])}
            >
              <Plus size={16} /> 新增大类
            </button>
          </header>
          {normalized.map((category, categoryIndex) => (
            <article className="catalog-category" key={category.id}>
              <div className="catalog-category-heading">
                <input
                  aria-label="服务大类名称"
                  value={category.label}
                  onChange={(event) => setCatalogDraft((current) => current.map((item) =>
                    item.id === category.id ? { ...item, label: event.target.value } : item,
                  ))}
                />
                <label><input type="checkbox" checked={category.enabled} onChange={(event) => setCatalogDraft((current) => current.map((item) => item.id === category.id ? { ...item, enabled: event.target.checked } : item))} /> 启用</label>
                <div className="catalog-order-actions">
                  <button aria-label={`上移${category.label}`} type="button" disabled={categoryIndex === 0} onClick={() => setCatalogDraft((current) => moveEntry(current, categoryIndex, categoryIndex - 1))}><ArrowUp size={15} /></button>
                  <button aria-label={`下移${category.label}`} type="button" disabled={categoryIndex === normalized.length - 1} onClick={() => setCatalogDraft((current) => moveEntry(current, categoryIndex, categoryIndex + 1))}><ArrowDown size={15} /></button>
                </div>
                <button type="button" onClick={() => setCatalogDraft((current) => current.map((item) => item.id === category.id ? { ...item, items: [...item.items, { id: `item-${Date.now()}`, label: "新服务项目", enabled: true, order: item.items.length }] } : item))}>新增项目</button>
              </div>
              <div className="catalog-items">
                {category.items.map((item, itemIndex) => (
                  <div key={item.id}>
                    <span>{categoryIndex + 1}.{itemIndex + 1}</span>
                    <input value={item.label} onChange={(event) => setCatalogDraft((current) => current.map((entry) => entry.id === category.id ? { ...entry, items: entry.items.map((child) => child.id === item.id ? { ...child, label: event.target.value } : child) } : entry))} />
                    <label><input type="checkbox" checked={item.enabled} onChange={(event) => setCatalogDraft((current) => current.map((entry) => entry.id === category.id ? { ...entry, items: entry.items.map((child) => child.id === item.id ? { ...child, enabled: event.target.checked } : child) } : entry))} /> 启用</label>
                    <div className="catalog-order-actions">
                      <button aria-label={`上移${item.label}`} type="button" disabled={itemIndex === 0} onClick={() => setCatalogDraft((current) => current.map((entry) => entry.id === category.id ? { ...entry, items: moveEntry(entry.items, itemIndex, itemIndex - 1) } : entry))}><ArrowUp size={14} /></button>
                      <button aria-label={`下移${item.label}`} type="button" disabled={itemIndex === category.items.length - 1} onClick={() => setCatalogDraft((current) => current.map((entry) => entry.id === category.id ? { ...entry, items: moveEntry(entry.items, itemIndex, itemIndex + 1) } : entry))}><ArrowDown size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
          <button
            className="primary-action"
            type="button"
            disabled={busy}
            onClick={() => void submit(
              "/organization/service-workspace-config",
              {
                rules: serviceRules,
                categories: normalized,
                enabledServiceItemIds: normalized.flatMap((category) => category.enabled ? category.items.filter((item) => item.enabled).map((item) => item.id) : []),
              },
              "服务项目目录已保存，新任务将使用最新目录。",
            )}
          >
            {busy ? "正在保存…" : "保存项目目录"}
          </button>
        </section>
      </Page>
    );
  }

  if (view === "planning")
    return (
      <Page
        title="服务计划与派单"
        lead="先建立持续服务关系，再按日期派发具体服务任务。"
      >
        <div className="business-columns">
          <DataPanel title="持续服务关系" icon={<CalendarDays />}>
            {data.engagements.map((row) => (
              <Row
                key={String(row.id)}
                title={`${row.elderName} · ${modeLabels[String(row.mode)] || row.mode}`}
                meta={`${row.frequency} · ${row.responsible} · ${row.startDate}起`}
                status={String(row.status)}
              />
            ))}
          </DataPanel>
          <DataPanel title="近期任务" icon={<UsersRound />}>
            {tasks.map((task) => (
              <Row
                key={task.id}
                title={`${task.elderName} · ${task.serviceItems.join("、")}`}
                meta={`${new Date(task.scheduledAt).toLocaleString("zh-CN")} · ${task.stageProgress}/3 阶段`}
                status={task.status}
              />
            ))}
          </DataPanel>
        </div>
        <div className="business-columns editors">
          <Editor title="建立服务关系">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                void submit(
                  "/organization/engagements",
                  {
                    elderName: f.get("elderName"),
                    mode: f.get("mode"),
                    startDate: f.get("startDate"),
                    frequency: f.get("frequency"),
                    responsible: f.get("responsible"),
                  },
                  "服务关系已建立。",
                );
              }}
            >
              <ElderSelect elders={elders} />
              <label>
                <span>服务形态</span>
                <select name="mode">
                  {Object.entries(modeLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="开始日期" name="startDate" type="date" />
              <Field
                label="服务频次"
                name="frequency"
                placeholder="例如：每周一次"
              />
              <label>
                <span>负责人</span>
                <select name="responsible" required>
                  <option value="">请选择负责人</option>
                  {data.staff.map((row) => (
                    <option value={String(row.name)} key={String(row.id)}>
                      {String(row.name)} · {String(row.role)}
                    </option>
                  ))}
                </select>
              </label>
              <Submit busy={busy} />
            </form>
          </Editor>
          <Editor title="派发服务任务">
            <form
              onSubmit={(event) => {
                const f = formValues(event);
                const elder = elders.find(
                  (item) => item.displayName === f.get("elderName"),
                );
                const serviceItems = f.getAll("serviceItems");
                if (!serviceItems.length) {
                  fail("请至少选择一个具体服务项目。");
                  return;
                }
                void submit(
                  "/organization/operations/tasks",
                  {
                    elderName: f.get("elderName"),
                    archiveNo: elder?.archiveNo,
                    scheduledAt: f.get("scheduledAt"),
                    serviceItems,
                    responsibleId: f.get("responsibleId"),
                    participantIds: Array.from(
                      new Set(
                        f
                          .getAll("participantIds")
                          .map(String)
                          .filter(
                            (id) => id !== String(f.get("responsibleId") || ""),
                          ),
                      ),
                    ).filter(Boolean),
                  },
                  "服务任务已派发到员工端。",
                );
              }}
            >
              <ElderSelect elders={elders} />
              <Field
                label="执行时间"
                name="scheduledAt"
                type="datetime-local"
              />
              <fieldset className="service-catalog-picker">
                <legend>服务项目</legend>
                <p>先选择服务大类，再勾选本次实际执行的项目。</p>
                {serviceCategories.map((category) => {
                  const selected = selectedServiceCategoryIds.includes(
                    category.id,
                  );
                  return (
                    <section key={category.id}>
                      <label className="category-toggle">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            setSelectedServiceCategoryIds((current) =>
                              event.target.checked
                                ? [...current, category.id]
                                : current.filter((id) => id !== category.id),
                            )
                          }
                        />
                        <strong>{category.label}</strong>
                        <small>{category.items.length} 项</small>
                      </label>
                      {selected ? (
                        <div className="service-item-options">
                          {category.items.map((item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                name="serviceItems"
                                value={`${category.label}·${item.label}`}
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </fieldset>
              <label>
                <span>负责人</span>
                <select name="responsibleId" required>
                  {data.staff.map((row) => (
                    <option value={String(row.id)} key={String(row.id)}>
                      {String(row.name)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="people-picker">
                <legend>协作人员</legend>
                <p>负责人会自动加入任务；这里只选择其他协作人员。</p>
                <div>
                  {data.staff.map((row) => (
                    <label key={String(row.id)}>
                      <input
                        type="checkbox"
                        name="participantIds"
                        value={String(row.id)}
                      />
                      <span>
                        {String(row.name)} · {String(row.role)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Submit busy={busy} />
            </form>
          </Editor>
        </div>
      </Page>
    );

  if (view === "contracts")
    return (
      <Page
        title="合同档案"
        lead="统一管理纸质扫描、演示签署、版本和归档状态。"
      >
        <DataPanel title="合同列表" icon={<FileSignature />}>
          {data.contracts.map((row) => (
            <ActionRow
              key={String(row.id)}
              title={`${row.contractNo} · ${row.elderName}`}
              meta={`${row.type} · 第${row.version}版 · ${row.fileName}`}
              status={String(row.status)}
              actions={
                String(row.status) === "DRAFT"
                  ? [["发起签署", "REQUEST_SIGN"]]
                  : String(row.status) === "PENDING_SIGN"
                    ? [["完成演示签署", "SIGN"]]
                    : String(row.status) === "SIGNED"
                      ? [["归档", "ARCHIVE"]]
                      : []
              }
              onAction={(action) =>
                submit(
                  `/organization/contracts/${row.id}/action`,
                  { action },
                  "合同状态已更新。",
                )
              }
            />
          ))}
        </DataPanel>
        <Editor title="登记合同">
          <form
            onSubmit={(event) => {
              const f = formValues(event);
              void submit(
                "/organization/contracts",
                {
                  elderName: f.get("elderName"),
                  type: f.get("type"),
                  fileName: f.get("fileName"),
                  validUntil: f.get("validUntil"),
                },
                "合同已登记。",
              );
            }}
          >
            <ElderSelect elders={elders} />
            <Field label="合同类型" name="type" value="居家养老上门服务合同" />
            <Field
              label="扫描文件名称"
              name="fileName"
              value="合同扫描件.pdf"
            />
            <Field label="有效期" name="validUntil" type="date" />
            <p className="artifact-note">
              生成件统一标注“演示件，不具业务效力”。
            </p>
            <Submit busy={busy} />
          </form>
        </Editor>
      </Page>
    );

  if (view === "subsidies")
    return (
      <Page
        title="消费券核销"
        lead="按服务对象和月份汇总记录，生成材料包并登记人工报送结果。"
      >
        <DataPanel title="月度核销台账" icon={<FileDown />}>
          {data.subsidies.map((row) => (
            <ActionRow
              key={String(row.id)}
              title={`${row.elderName} · ${row.yearMonth}`}
              meta={`${row.recordCount}条记录 · 消费券 ¥${(Number(row.voucherCents) / 100).toFixed(2)} · ${row.packageName}`}
              status={String(row.status)}
              actions={
                String(row.status) === "DRAFT"
                  ? [["生成材料包", "GENERATE"]]
                  : String(row.status) === "READY"
                    ? [["登记已报送", "SUBMIT"]]
                    : String(row.status) === "SUBMITTED"
                      ? [
                          ["登记审核通过", "ACCEPT"],
                          ["登记退回", "RETURN"],
                        ]
                      : String(row.status) === "RETURNED"
                        ? [["重新生成", "GENERATE"]]
                        : []
              }
              onAction={(action) =>
                submit(
                  `/organization/subsidies/${row.id}/action`,
                  {
                    action,
                    reason: action === "RETURN" ? "材料内容需要补充核对" : "",
                  },
                  "核销状态已更新。",
                )
              }
            />
          ))}
        </DataPanel>
        <Editor title="建立月度台账">
          <form
            onSubmit={(event) => {
              const f = formValues(event);
              void submit(
                "/organization/subsidies",
                {
                  elderName: f.get("elderName"),
                  yearMonth: f.get("yearMonth"),
                  recordCount: Number(f.get("recordCount")),
                  voucherCents: Number(f.get("voucherYuan")) * 100,
                  totalCents: Number(f.get("totalYuan")) * 100,
                },
                "月度核销台账已建立。",
              );
            }}
          >
            <ElderSelect elders={elders} />
            <Field label="服务月份" name="yearMonth" type="month" />
            <Field
              label="服务记录数"
              name="recordCount"
              type="number"
              value="4"
            />
            <Field
              label="消费券金额（元）"
              name="voucherYuan"
              type="number"
              value="600"
            />
            <Field
              label="合计金额（元）"
              name="totalYuan"
              type="number"
              value="600"
            />
            <Submit busy={busy} />
          </form>
        </Editor>
      </Page>
    );

  if (view === "promotion")
    return (
      <Page
        title="宣传素材"
        lead="只有授权有效且经门店筛选的素材才能进入宣传工作台。"
      >
        <DataPanel title="宣传工作台" icon={<Image />}>
          {data.promotion.map((row) => (
            <ActionRow
              key={String(row.id)}
              title={String(row.title)}
              meta={`${row.elderName} · ${row.sourceStage} · ${row.fileName} · 授权${row.consentStatus === "VALID" ? "有效" : "无效"}`}
              status={String(row.reviewStatus)}
              actions={
                String(row.reviewStatus) === "PENDING"
                  ? [
                      ["通过", "APPROVE"],
                      ["不采用", "REJECT"],
                    ]
                  : []
              }
              onAction={(action) =>
                submit(
                  `/organization/promotion-assets/${row.id}/action`,
                  { action },
                  "素材审核结果已保存。",
                )
              }
            />
          ))}
        </DataPanel>
        <Editor title="选入宣传工作台">
          <form
            onSubmit={(event) => {
              const f = formValues(event);
              void submit(
                "/organization/promotion-assets",
                {
                  title: f.get("title"),
                  elderName: f.get("elderName"),
                  fileName: f.get("fileName"),
                  sourceStage: f.get("sourceStage"),
                },
                "素材已进入待审核列表。",
              );
            }}
          >
            <Field label="素材标题" name="title" />
            <ElderSelect elders={elders} />
            <Field label="文件名称" name="fileName" value="服务现场照片.jpg" />
            <label>
              <span>来源阶段</span>
              <select name="sourceStage">
                <option>服务前</option>
                <option>服务中</option>
                <option>服务后</option>
              </select>
            </label>
            <Submit busy={busy} />
          </form>
        </Editor>
      </Page>
    );

  if (view === "food")
    return (
      <Page
        title="食品追溯"
        lead="记录食材来源、批次、票据和责任人，不保存用餐打卡照片。"
      >
        <DataPanel title="食品流转记录" icon={<Utensils />}>
          {data.food.map((row) => (
            <ActionRow
              key={String(row.id)}
              title={`${row.ingredient} · ${row.batchNo}`}
              meta={`${row.serviceDate} · ${row.supplier} · ${row.quantity || "数量未填"} · 影像材料 ${Array.isArray(row.evidenceIds) ? row.evidenceIds.length : 0} 份${row.voiceMediaId ? " · 有语音备注" : ""}`}
              status={String(row.status)}
              detail={(
                <div className="row-media-review">
                  {Array.isArray(row.evidence) ? row.evidence.map((item) => (
                    <a key={String(item.id)} href={String(item.dataUrl)} target="_blank" rel="noreferrer" title="打开原图">
                      <img src={String(item.dataUrl)} alt={String(item.fileName || "食品票据或批次照片")} />
                    </a>
                  )) : null}
                  {(row.voice as Record<string, unknown> | undefined)?.dataUrl ? (
                    <audio controls preload="none" src={String((row.voice as Record<string, unknown>).dataUrl)} />
                  ) : null}
                </div>
              )}
              actions={String(row.status) === "SUBMITTED" ? [["确认合规", "VERIFY"], ["退回修改", "RETURN"]] : []}
              onAction={(action) => {
                const reason = action === "RETURN" ? window.prompt("请填写需要修改的内容") || "" : "";
                if (action === "RETURN" && !reason.trim()) return;
                void submit(`/organization/food-traces/${row.id}/action`, { action, reason }, action === "VERIFY" ? "该流转记录已确认合规。" : "已退回给餐饮人员修改。");
              }}
            />
          ))}
        </DataPanel>
        <Editor title="新增流转记录">
          <form
            onSubmit={(event) => {
              const f = formValues(event);
              void submit(
                "/organization/food-traces",
                Object.fromEntries(f.entries()),
                "食品流转记录已保存。",
              );
            }}
          >
            <Field label="日期" name="serviceDate" type="date" />
            <Field label="食材名称" name="ingredient" />
            <Field label="供应商" name="supplier" />
            <Field label="批次号" name="batchNo" />
            <Field label="票据或证件" name="certificate" />
            <Field label="责任人" name="responsible" />
            <Submit busy={busy} />
          </form>
        </Editor>
      </Page>
    );

  if (view === "archives")
    return (
      <Page
        title="数据归档与导出"
        lead="服务影像暂存三年，合同永久保存；争议期间暂停删除。"
      >
        <DataPanel title="归档目录" icon={<ArchiveRestore />}>
          {data.archives.map((row) => (
            <ActionRow
              key={String(row.id)}
              title={String(row.title)}
              meta={`${row.category} · 保存至 ${row.retentionUntil} · 导出${row.exportStatus === "READY" ? "已就绪" : "未申请"}`}
              status={row.legalHold ? "HOLD" : "ACTIVE"}
              actions={
                row.legalHold
                  ? [
                      ["解除保全", "RELEASE"],
                      ["准备导出", "EXPORT"],
                    ]
                  : [
                      ["启动保全", "HOLD"],
                      ["准备导出", "EXPORT"],
                    ]
              }
              onAction={(action) =>
                submit(
                  `/organization/archives/${row.id}/action`,
                  { action },
                  action === "EXPORT" ? "导出文件已准备。" : "保全状态已更新。",
                )
              }
            />
          ))}
        </DataPanel>
      </Page>
    );

  return (
    <Page title="机构设置" lead="配置门店打卡范围、时间容差和材料保存年限。">
      <Editor title="业务规则">
        <form
          onSubmit={(event) => {
            const f = formValues(event);
            void submit(
              "/organization/settings",
              {
                ...Object.fromEntries(f.entries()),
                attendanceEnabled: f.has("attendanceEnabled"),
                foodTraceEnabled: f.has("foodTraceEnabled"),
                customerFeedbackEnabled: f.has("customerFeedbackEnabled"),
              },
              "机构设置已保存。",
            );
          }}
        >
          <Field
            label="机构名称"
            name="organizationName"
            value={String(data.settings.organizationName || "")}
          />
          <fieldset className="settings-options">
            <legend>员工端应用</legend>
            <label className="check-line">
              <input type="checkbox" name="attendanceEnabled" defaultChecked={Boolean(data.settings.attendanceEnabled)} />
              <span><strong>上下班考勤</strong><small>独立记录员工上下班，不与服务阶段记录混用。</small></span>
            </label>
            <label className="check-line">
              <input type="checkbox" name="foodTraceEnabled" defaultChecked={Boolean(data.settings.foodTraceEnabled)} />
              <span><strong>食品追溯采集</strong><small>只向餐饮部门人员开放拍照和语音登记入口。</small></span>
            </label>
            <label className="check-line">
              <input type="checkbox" name="customerFeedbackEnabled" defaultChecked={Boolean(data.settings.customerFeedbackEnabled)} />
              <span><strong>客户反馈</strong><small>具体材料是否必填，由服务表单中的客户反馈组件决定。</small></span>
            </label>
          </fieldset>
          <Field
            label="定位范围（米）"
            name="locationRadiusMeters"
            type="number"
            value={String(data.settings.locationRadiusMeters || 300)}
          />
          <Field
            label="时间容差（分钟）"
            name="timeToleranceMinutes"
            type="number"
            value={String(data.settings.timeToleranceMinutes || 30)}
          />
          <Field
            label="普通影像保存年限"
            name="evidenceRetentionYears"
            type="number"
            value={String(data.settings.evidenceRetentionYears || 3)}
          />
          <p className="artifact-note">
            <ShieldAlert />
            合同永久保存；法律保全期间不执行删除。
          </p>
          <Submit busy={busy} />
        </form>
      </Editor>
    </Page>
  );
}

function Page({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topline business-heading">
        <div>
          <p>机构业务中心</p>
          <h1>{title}</h1>
        </div>
      </header>
      <p className="module-lead">{lead}</p>
      <div className="business-page">{children}</div>
    </>
  );
}
function DataPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="business-panel">
      <header>
        {icon}
        <h2>{title}</h2>
      </header>
      <div className="business-list">{children}</div>
    </section>
  );
}
function Editor({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="business-editor">
      <header>
        <Plus />
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
function Row({
  title,
  meta,
  status,
}: {
  title: string;
  meta: string;
  status: string;
}) {
  return (
    <article className="business-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <mark>{statusLabels[status] || status}</mark>
    </article>
  );
}
function ActionRow({
  title,
  meta,
  status,
  actions,
  onAction,
  detail,
}: {
  title: string;
  meta: string;
  status: string;
  actions: string[][];
  onAction: (action: string) => void;
  detail?: ReactNode;
}) {
  return (
    <article className="business-row action-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <mark>{statusLabels[status] || status}</mark>
      <div className="row-actions">
        {actions.map(([label, action]) => (
          <button type="button" key={action} onClick={() => onAction(action)}>
            {label}
          </button>
        ))}
      </div>
      {detail}
    </article>
  );
}
function Field({
  label,
  name,
  type = "text",
  placeholder = "",
  value,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={value}
        required
      />
    </label>
  );
}
function ElderSelect({
  elders,
}: {
  elders: Array<{ displayName: string; archiveNo: string }>;
}) {
  return (
    <label>
      <span>服务对象</span>
      <select name="elderName" required>
        {elders.map((elder) => (
          <option value={elder.displayName} key={elder.archiveNo}>
            {elder.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
function Submit({ busy, label = "保存" }: { busy: boolean; label?: string }) {
  return (
    <button className="primary-action" disabled={busy}>
      {busy ? "正在保存…" : label}
    </button>
  );
}
