import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronRight,
  FileClock,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./audit.css";

type View = "overview" | "tenants" | "qualifications" | "subscriptions" | "grants" | "audit" | "system";
type SubscriptionPlan = {
  code: string; name: string; monthlyPriceCents: number; staffLimit: number;
  elderLimit: number; storageMb: number; description: string; features: string[];
};
type Tenant = {
  id: string; name: string; status: "ACTIVE" | "READ_ONLY" | "SUSPENDED";
  validUntil: string; capacityMb: number; usedBytes: number; usagePercent: number;
  staffCount: number; renewalStatus: string; archiveNo: string; institutionType: string;
  unifiedSocialCreditCode: string; legalRepresentative: string; contactName: string;
  contactPhone: string; province: string; city: string; district: string; address: string;
  onboardingStage: string; serviceScopes: string[]; notes: string;
  subscription: { planCode: string; planName: string; billingCycle: "MONTHLY"; monthlyPriceCents: number; currentPeriodStart: string; currentPeriodEnd: string };
};
type Qualification = {
  tenantId: string; tenantName: string; code: string; name: string;
  status: "MISSING" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  uploadStatus: "NOT_UPLOADED" | "UPLOADED"; fileName?: string; validUntil?: string;
  submittedAt?: string; reviewedAt?: string; reviewedBy?: string; rejectionReason?: string;
};
type Grant = { id: string; tenantId: string; reason: string; scope: string; allowDownload: boolean; expiresAt: string; revokedAt?: string; active: boolean; issuedBy: string };
type Audit = { id: string; tenantId: string; actorId: string; action: string; resourceType: string; resourceId: string; outcome: string; reason?: string; occurredAt: string };
type SystemItem = { code: string; label: string; status: string; detail: string };
type Overview = { tenants: number; suspendedTenants: number; capacityWarnings: number; activeSupportGrants: number; monthlyRecurringRevenueCents: number };

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const headers = { "content-type": "application/json", "x-dev-role": "PLATFORM_OPERATOR", "x-dev-actor-id": "platform-demo-operator" };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  const body = (await response.json()) as { data?: T; message?: string | string[] };
  if (!response.ok || body.data === undefined) throw new Error(Array.isArray(body.message) ? body.message.join("；") : body.message || "本地业务服务请求失败");
  return body.data;
}

const navigation = [
  { group: "运营总览", items: [{ view: "overview" as const, label: "平台工作台", icon: LayoutDashboard }] },
  { group: "机构治理", items: [
    { view: "tenants" as const, label: "机构档案", icon: Building2 },
    { view: "qualifications" as const, label: "机构资质", icon: ShieldCheck },
    { view: "grants" as const, label: "支持授权", icon: KeyRound },
  ] },
  { group: "商业运营", items: [{ view: "subscriptions" as const, label: "套餐与订阅", icon: PackageCheck }] },
  { group: "安全与运行", items: [
    { view: "audit" as const, label: "审计中心", icon: FileClock },
    { view: "system" as const, label: "能力与系统状态", icon: Activity },
  ] },
];
const titles: Record<View, [string, string]> = {
  overview: ["平台工作台", "集中处理机构风险、资质审核、订阅和运行事项"],
  tenants: ["机构档案", "为接入机构建档，并维护运行、容量与订阅状态"],
  qualifications: ["机构资质", "审核机构提交的材料，并控制对应专业服务权限"],
  subscriptions: ["套餐与订阅", "配置演示套餐并查看机构月度订阅状态"],
  grants: ["支持授权", "查看机构主动创建的限时受控支持授权"],
  audit: ["审计中心", "查询平台与机构的关键操作记录"],
  system: ["能力与系统状态", "区分当前可用能力、待配置能力与后续接入计划"],
};
const tenantStatus: Record<string, string> = { ACTIVE: "正常使用", READ_ONLY: "只读", SUSPENDED: "已停用" };
const qualificationStatus: Record<string, string> = { MISSING: "未提交", PENDING: "待审核", APPROVED: "审核通过", REJECTED: "已退回", EXPIRED: "已过期" };
const actionNames: Record<string, string> = {
  TENANT_CREATE: "建立机构档案", TENANT_CONFIG_UPDATE: "更新机构配置", SUBSCRIPTION_PLAN_ASSIGN: "调整订阅套餐",
  QUALIFICATION_APPROVE: "资质审核通过", QUALIFICATION_REJECT: "退回资质材料", SUPPORT_GRANT_CREATE: "创建支持授权",
  SUPPORT_GRANT_REVOKE: "撤回支持授权", TASK_CREATE: "派发服务任务", TASK_SUBMIT: "提交服务审核", TASK_APPROVE: "服务审核通过", TASK_RETURN: "退回修改",
};

function money(cents: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(cents / 100); }
function date(value?: string) { return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(new Date(value)) : "—"; }
function dateTime(value?: string) { return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }

function App() {
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [summary, tenantRows, planRows, qualificationRows, grantRows, auditRows, systemRows] = await Promise.all([
        api<Overview>("/platform/overview"), api<Tenant[]>("/platform/tenants"), api<SubscriptionPlan[]>("/platform/subscription-plans"),
        api<Qualification[]>("/platform/qualifications"), api<Grant[]>("/platform/support-grants"), api<Audit[]>("/platform/audit"), api<SystemItem[]>("/platform/capability-status"),
      ]);
      setOverview(summary); setTenants(tenantRows); setPlans(planRows); setQualifications(qualificationRows); setGrants(grantRows); setAudits(auditRows); setSystems(systemRows);
      setSelected((current) => current ? tenantRows.find((item) => item.id === current.id) || null : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "数据加载失败"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filteredTenants = useMemo(() => tenants.filter((item) => `${item.name}${item.archiveNo}${item.contactName}`.toLowerCase().includes(query.toLowerCase())), [query, tenants]);

  async function saveTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/platform/tenants/${selected.id}/config`, { method: "POST", body: JSON.stringify({
        status: data.get("status"), validUntil: data.get("validUntil"), capacityMb: Number(data.get("capacityMb")), renewalStatus: data.get("renewalStatus"), planCode: data.get("planCode"),
        archiveNo: data.get("archiveNo"), institutionType: data.get("institutionType"), unifiedSocialCreditCode: data.get("unifiedSocialCreditCode"), legalRepresentative: data.get("legalRepresentative"),
        contactName: data.get("contactName"), contactPhone: data.get("contactPhone"), province: data.get("province"), city: data.get("city"), district: data.get("district"), address: data.get("address"),
        onboardingStage: data.get("onboardingStage"), serviceScopes: String(data.get("serviceScopes") || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean), notes: data.get("notes"),
      }) });
      setNotice("机构档案和运行配置已保存。"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
  }
  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      await api("/platform/tenants", { method: "POST", body: JSON.stringify({ name: data.get("name"), planCode: data.get("planCode"), validUntil: data.get("validUntil"), capacityMb: Number(data.get("capacityMb")), institutionType: data.get("institutionType"), unifiedSocialCreditCode: data.get("unifiedSocialCreditCode"), contactName: data.get("contactName"), contactPhone: data.get("contactPhone"), district: data.get("district"), address: data.get("address") }) });
      setCreating(false); setNotice("机构档案已建立，可以继续补充资质和运行配置。"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "建立机构失败"); }
  }
  async function reviewQualification(item: Qualification, action: "APPROVE" | "REJECT") {
    const reason = action === "REJECT" ? window.prompt("请输入退回原因")?.trim() : "";
    if (action === "REJECT" && !reason) return;
    try {
      await api(`/platform/qualifications/${item.tenantId}/${item.code}/review`, { method: "POST", body: JSON.stringify({ action, reason, validUntil: action === "APPROVE" ? "2027-12-31" : undefined }) });
      setNotice(action === "APPROVE" ? "资质已审核通过，相关专业服务可以启用。" : "资质已退回，机构端将显示退回原因。"); await load();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "资质审核失败"); }
  }

  return <div className="platform-shell">
    <aside className="platform-rail">
      <div className="brand"><ShieldCheck size={26}/><div><strong>照护云台</strong><small>平台运营后台</small></div></div>
      {navigation.map((section) => <section className="nav-section" key={section.group}><p>{section.group}</p>{section.items.map((item) => <button key={item.view} className={view === item.view ? "active" : ""} onClick={() => setView(item.view)}><item.icon size={17}/><span>{item.label}</span><ChevronRight size={14}/></button>)}</section>)}
      <div className="rail-security"><ShieldCheck size={16}/><span>平台默认不能查看机构老人、合同正文和原始履约影像</span></div>
    </aside>
    <main className="platform-main">
      <header className="topbar"><label className="global-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索机构、联系人或档案号"/></label><div className="operator"><span>演示环境</span><strong>平台运营员</strong></div></header>
      <div className="page-heading"><div><p>平台运营中心</p><h1>{titles[view][0]}</h1><span>{titles[view][1]}</span></div>{view === "tenants" ? <button className="primary" onClick={() => setCreating(true)}><Plus size={17}/>新建机构</button> : null}</div>
      {notice ? <div className="notice">{notice}</div> : null}{error ? <><div className="error">{error}</div><button className="retry-load" onClick={() => void load()}>重新连接</button></> : null}
      {view === "overview" ? <OverviewPage overview={overview} tenants={tenants} qualifications={qualifications} onOpen={(next) => setView(next)} onTenant={(tenant) => { setSelected(tenant); setView("tenants"); }}/> : null}
      {view === "tenants" ? <TenantPage tenants={filteredTenants} onSelect={setSelected}/> : null}
      {view === "qualifications" ? <QualificationPage rows={qualifications.filter((item) => `${item.tenantName}${item.name}`.includes(query))} onReview={reviewQualification}/> : null}
      {view === "subscriptions" ? <SubscriptionPage plans={plans} tenants={filteredTenants} onSelect={setSelected}/> : null}
      {view === "grants" ? <GrantPage rows={grants} tenants={tenants}/> : null}
      {view === "audit" ? <AuditPage rows={audits} tenants={tenants}/> : null}
      {view === "system" ? <SystemPage rows={systems}/> : null}
    </main>
    {selected ? <TenantDrawer tenant={selected} plans={plans} onClose={() => setSelected(null)} onSubmit={saveTenant}/> : null}
    {creating ? <CreateTenantDrawer plans={plans} onClose={() => setCreating(false)} onSubmit={createTenant}/> : null}
  </div>;
}

function OverviewPage({ overview, tenants, qualifications, onOpen, onTenant }: { overview: Overview | null; tenants: Tenant[]; qualifications: Qualification[]; onOpen: (view: View) => void; onTenant: (tenant: Tenant) => void }) {
  const pending = qualifications.filter((item) => item.status === "PENDING").length;
  return <><section className="metric-band">
    {[{ label: "接入机构", value: overview?.tenants || 0, icon: Building2 }, { label: "待审资质", value: pending, icon: ShieldCheck }, { label: "容量预警", value: overview?.capacityWarnings || 0, icon: HardDrive }, { label: "停用机构", value: overview?.suspendedTenants || 0, icon: AlertTriangle }, { label: "月度订阅额", value: money(overview?.monthlyRecurringRevenueCents || 0), icon: PackageCheck }].map((item) => <article key={item.label}><item.icon size={18}/><strong>{item.value}</strong><span>{item.label}</span></article>)}
  </section><div className="dashboard-grid">
    <section className="work-card priority"><header><div><small>待处理</small><h2>机构风险与审核事项</h2></div><button onClick={() => onOpen("qualifications")}>查看资质</button></header>
      {pending ? <button className="risk-row" onClick={() => onOpen("qualifications")}><ShieldCheck size={17}/><div><strong>{pending} 项资质等待审核</strong><span>审核结论将影响专业服务是否可用</span></div><ChevronRight size={15}/></button> : null}
      {tenants.filter((item) => item.status !== "ACTIVE" || item.usagePercent >= 80).map((item) => <button className="risk-row" key={item.id} onClick={() => onTenant(item)}><AlertTriangle size={17}/><div><strong>{item.name}</strong><span>{item.status !== "ACTIVE" ? tenantStatus[item.status] : `容量已使用 ${item.usagePercent}%`}</span></div><ChevronRight size={15}/></button>)}
    </section>
    <section className="work-card"><header><div><small>收入观察</small><h2>订阅配置</h2></div><button onClick={() => onOpen("subscriptions")}>查看套餐</button></header><div className="list-row"><PackageCheck size={18}/><div><strong>{money(overview?.monthlyRecurringRevenueCents || 0)}</strong><span>按当前机构套餐汇总的演示月度订阅额</span></div></div></section>
  </div></>;
}

function TenantPage({ tenants, onSelect }: { tenants: Tenant[]; onSelect: (tenant: Tenant) => void }) {
  return <section className="data-card"><div className="data-head"><span>机构档案</span><span>接入阶段</span><span>有效期</span><span>容量</span><span>员工</span><span></span></div>{tenants.map((item) => <button className="tenant-row" key={item.id} onClick={() => onSelect(item)}><div><strong>{item.name}</strong><small>{item.archiveNo || "未编档"} · {item.institutionType}</small></div><mark data-tone={item.status}>{item.onboardingStage || tenantStatus[item.status]}</mark><span>{date(item.validUntil)}</span><div className="usage"><span>{item.usagePercent}%</span><i><b style={{ width: `${Math.min(item.usagePercent, 100)}%` }}/></i></div><span>{item.staffCount} 人</span><Settings2 size={17}/></button>)}</section>;
}

function QualificationPage({ rows, onReview }: { rows: Qualification[]; onReview: (item: Qualification, action: "APPROVE" | "REJECT") => void }) {
  return <section className="data-card qualification-review"><div className="section-intro"><ShieldCheck/><div><h2>平台审核决定专业服务权限</h2><p>机构只能提交材料；平台审核通过后，系统才允许启用对应专业服务。</p></div></div>
    {rows.length ? rows.map((item) => <article className="qualification-review-row" key={`${item.tenantId}-${item.code}`}><div><strong>{item.tenantName}</strong><span>{item.name}</span></div><div><strong>{item.fileName || "未上传材料"}</strong><span>{item.submittedAt ? `提交于 ${dateTime(item.submittedAt)}` : item.status === "APPROVED" ? "历史审核记录" : "尚未提交"}</span>{item.rejectionReason ? <span className="danger-text">上次退回：{item.rejectionReason}</span> : null}</div><mark data-tone={item.status}>{qualificationStatus[item.status]}</mark><div className="qualification-review-actions"><button disabled={item.status !== "PENDING"} onClick={() => void onReview(item, "REJECT")}>退回</button><button className="primary" disabled={item.status !== "PENDING"} onClick={() => void onReview(item, "APPROVE")}>通过</button></div></article>) : <Empty text="当前没有资质记录；机构首次进入资质中心后会建立记录。"/>}
  </section>;
}

function SubscriptionPage({ plans, tenants, onSelect }: { plans: SubscriptionPlan[]; tenants: Tenant[]; onSelect: (tenant: Tenant) => void }) {
  return <div className="subscription-workspace"><div className="pricing-disclaimer">当前价格用于验证套餐分配与订阅流程，不是正式报价；当前不在线收款。</div><section className="plan-grid">{plans.map((plan) => <article className="plan-card" key={plan.code}><header><div><small>月度订阅</small><h2>{plan.name}</h2></div><strong>{money(plan.monthlyPriceCents)}<span>/月</span></strong></header><p>{plan.description}</p><dl><div><dt>员工额度</dt><dd>{plan.staffLimit} 人</dd></div><div><dt>老人档案</dt><dd>{plan.elderLimit} 份</dd></div><div><dt>存储空间</dt><dd>{Math.round(plan.storageMb / 1024)} GB</dd></div><div><dt>已分配机构</dt><dd>{tenants.filter((item) => item.subscription.planCode === plan.code).length} 家</dd></div></dl><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></article>)}</section>
    <section className="data-card subscription-tenants"><div className="data-head subscription-head"><span>机构</span><span>当前套餐</span><span>月费</span><span>本期截止</span><span>状态</span></div>{tenants.map((tenant) => <button className="subscription-row" key={tenant.id} onClick={() => onSelect(tenant)}><strong>{tenant.name}</strong><span>{tenant.subscription.planName}</span><span>{money(tenant.subscription.monthlyPriceCents)}</span><span>{date(tenant.subscription.currentPeriodEnd)}</span><mark data-tone={tenant.status}>{tenantStatus[tenant.status]}</mark></button>)}</section></div>;
}

function GrantPage({ rows, tenants }: { rows: Grant[]; tenants: Tenant[] }) { return <section className="data-card"><div className="section-intro"><KeyRound/><div><h2>机构主动授权，平台受控使用</h2><p>授权撤回或到期后立即失效，普通平台人员不能常态查看机构敏感正文。</p></div></div>{rows.length ? rows.map((item) => <article className="grant-row" key={item.id}><div><strong>{item.reason}</strong><span>{tenants.find((tenant) => tenant.id === item.tenantId)?.name || "机构"} · {item.scope}</span></div><div><span>至 {dateTime(item.expiresAt)}</span><mark data-tone={item.active ? "ACTIVE" : "SUSPENDED"}>{item.active ? "有效" : "已失效"}</mark></div></article>) : <Empty text="暂无支持授权"/>}</section>; }
function AuditPage({ rows, tenants }: { rows: Audit[]; tenants: Tenant[] }) { return <section className="data-card"><div className="data-head audit"><span>时间</span><span>机构</span><span>操作人</span><span>动作</span><span>结果</span></div>{rows.map((item) => <div className="audit-table-row" key={item.id}><span>{dateTime(item.occurredAt)}</span><strong>{tenants.find((tenant) => tenant.id === item.tenantId)?.name || "平台"}</strong><span>{item.actorId}</span><div><strong>{actionNames[item.action] || item.action}</strong>{item.reason ? <small>{item.reason}</small> : null}</div><mark data-tone={item.outcome === "SUCCESS" ? "ACTIVE" : "SUSPENDED"}>{item.outcome === "SUCCESS" ? "成功" : "失败"}</mark></div>)}</section>; }
function SystemPage({ rows }: { rows: SystemItem[] }) { const label = (status: string) => status === "HEALTHY" ? "运行正常" : status === "CONFIG_REQUIRED" ? "待配置" : status === "MAINTENANCE" ? "维护中" : status === "ERROR" ? "异常" : "规划中"; return <><div className="pricing-disclaimer">这里显示平台能力的当前生命周期。后续接入正式供应商后，同一位置会更新为“待配置”或“运行正常”。</div><section className="system-grid">{rows.map((item) => <article key={item.code}><span className="system-icon"><Activity size={20}/></span><div><strong>{item.label}</strong><span>{item.status === "NOT_CONNECTED" ? "尚未进入本地演示范围" : item.detail}</span></div><mark data-tone={item.status === "HEALTHY" ? "ACTIVE" : "READ_ONLY"}>{label(item.status)}</mark></article>)}</section></>; }

function TenantDrawer({ tenant, plans, onClose, onSubmit }: { tenant: Tenant; plans: SubscriptionPlan[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="drawer-layer"><aside className="drawer wide-drawer"><header><div><small>机构档案与运行配置</small><h2>{tenant.name}</h2></div><button onClick={onClose}><X/></button></header><div className="privacy-boundary">这里只维护机构元数据、资质、订阅和运行状态，不展示老人、合同正文或原始影像。</div><form onSubmit={onSubmit}>
    <fieldset><legend>机构基本档案</legend><label>内部档案号<input name="archiveNo" defaultValue={tenant.archiveNo}/></label><label>机构类型<select name="institutionType" defaultValue={tenant.institutionType}><option>养老服务机构</option><option>护理服务机构</option><option>医养结合机构</option><option>社区服务机构</option></select></label><label>统一社会信用代码<input name="unifiedSocialCreditCode" defaultValue={tenant.unifiedSocialCreditCode}/></label><label>法定代表人<input name="legalRepresentative" defaultValue={tenant.legalRepresentative}/></label><label>联系人<input name="contactName" defaultValue={tenant.contactName}/></label><label>联系电话<input name="contactPhone" defaultValue={tenant.contactPhone}/></label><label>省份<input name="province" defaultValue={tenant.province}/></label><label>城市<input name="city" defaultValue={tenant.city}/></label><label>区县<input name="district" defaultValue={tenant.district}/></label><label>详细地址<input name="address" defaultValue={tenant.address}/></label><label>接入阶段<select name="onboardingStage" defaultValue={tenant.onboardingStage}><option>资料准备</option><option>资质审核</option><option>试运行</option><option>正式运行</option><option>暂停接入</option></select></label><label>服务范围<input name="serviceScopes" defaultValue={tenant.serviceScopes.join("、")} placeholder="用顿号分隔"/></label></fieldset>
    <fieldset><legend>运行与订阅</legend><label>月度套餐<select name="planCode" defaultValue={tenant.subscription.planCode}>{plans.map((plan) => <option value={plan.code} key={plan.code}>{plan.name} · {money(plan.monthlyPriceCents)}/月</option>)}</select></label><label>机构状态<select name="status" defaultValue={tenant.status}><option value="ACTIVE">正常使用</option><option value="READ_ONLY">只读</option><option value="SUSPENDED">停用</option></select></label><label>有效期<input name="validUntil" type="date" defaultValue={tenant.validUntil}/></label><label>容量额度（MB）<input name="capacityMb" type="number" min="100" defaultValue={tenant.capacityMb}/></label><label>续费状态<select name="renewalStatus" defaultValue={tenant.renewalStatus}><option value="TRIAL">试用期</option><option value="ACTIVE">已续费</option><option value="OVERDUE">已逾期</option></select></label><label>平台备注<input name="notes" defaultValue={tenant.notes}/></label></fieldset><button className="primary" type="submit">保存机构档案</button>
  </form></aside></div>;
}
function CreateTenantDrawer({ plans, onClose, onSubmit }: { plans: SubscriptionPlan[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="drawer-layer"><aside className="drawer"><header><div><small>机构接入</small><h2>建立机构档案</h2></div><button onClick={onClose}><X/></button></header><form onSubmit={onSubmit}><label>机构名称<input name="name" required/></label><label>机构类型<select name="institutionType"><option>养老服务机构</option><option>护理服务机构</option><option>医养结合机构</option><option>社区服务机构</option></select></label><label>统一社会信用代码<input name="unifiedSocialCreditCode"/></label><label>联系人<input name="contactName"/></label><label>联系电话<input name="contactPhone"/></label><label>区县<input name="district" defaultValue="城关区"/></label><label>详细地址<input name="address"/></label><label>月度套餐<select name="planCode" defaultValue="STARTER">{plans.map((plan) => <option value={plan.code} key={plan.code}>{plan.name} · {money(plan.monthlyPriceCents)}/月</option>)}</select></label><label>有效期<input name="validUntil" type="date" required defaultValue="2027-08-31"/></label><label>容量额度（MB）<input name="capacityMb" type="number" min="100" defaultValue="20480"/></label><button className="primary" type="submit">建立机构档案</button></form></aside></div>; }
function Empty({ text }: { text: string }) { return <div className="empty"><AlertTriangle size={18}/><span>{text}</span></div>; }

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
