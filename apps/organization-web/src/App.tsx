import {
  Archive,
  BadgeCheck,
  ClipboardList,
  FileArchive,
  LayoutDashboard,
  Search,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type ElderRow = {
  id: string;
  name: string;
  archiveNo: string;
  serviceMode: string;
  serviceModeCode: keyof typeof serviceModeLabels;
  progress: string;
  status: string;
  contact: string;
};

type ServicePeriodApiRecord = {
  id: string;
  elderId: string;
  yearMonth: string;
  serviceMode: keyof typeof serviceModeLabels;
  revision: number;
  status: "DRAFT" | "IN_SERVICE" | "READY_FOR_REVIEW" | "RETURNED";
  minimumRecordCount: number;
  completedRecordCount: number;
  selfPaidCents: number;
  voucherCents: number;
  totalCents: number;
};

type ElderApiRecord = {
  id: string;
  archiveNo: string;
  displayName: string;
  primaryContactName: string;
  primaryContactPhoneMasked: string;
  serviceMode: keyof typeof serviceModeLabels;
  completedRecords: number;
  minimumRecords: number;
  status: keyof typeof statusLabels;
};

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const developmentHeaders = {
  "content-type": "application/json",
  "x-dev-tenant-id": "tenant-lanzhou-pilot",
  "x-dev-role": "TENANT_ADMIN",
};

const serviceModeLabels = {
  PERIODIC_HOME_VISIT: "周期上门",
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
  RETURNED: "已退回",
} as const;

const periodStatusLabels = {
  DRAFT: "待开始",
  IN_SERVICE: "服务中",
  READY_FOR_REVIEW: "待审核",
  RETURNED: "已退回",
} as const;

const navigation = [
  { label: "今日概览", icon: LayoutDashboard },
  { label: "老人档案", icon: UsersRound, active: true },
  { label: "服务记录", icon: ClipboardList },
  { label: "合同档案", icon: Archive },
  { label: "核销材料", icon: FileArchive },
  { label: "机构设置", icon: Settings },
];

function progressWidth(progress: string): string {
  const [completed = 0, required = 4] = progress
    .split("/")
    .map((part) => Number(part.trim()));
  return `${Math.min(100, Math.max(0, (completed / required) * 100))}%`;
}

function mapApiElder(elder: ElderApiRecord): ElderRow {
  return {
    id: elder.id,
    name: elder.displayName,
    archiveNo: elder.archiveNo,
    serviceMode: serviceModeLabels[elder.serviceMode],
    serviceModeCode: elder.serviceMode,
    progress: `${elder.completedRecords} / ${elder.minimumRecords}`,
    status: statusLabels[elder.status],
    contact: `${elder.primaryContactName} · ${elder.primaryContactPhoneMasked}`,
  };
}

export function App() {
  const [elders, setElders] = useState<ElderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedElder, setSelectedElder] = useState<ElderRow | null>(null);
  const [periods, setPeriods] = useState<ServicePeriodApiRecord[]>([]);
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);
  const [isPeriodSaving, setIsPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState("");

  useEffect(() => {
    async function loadElders() {
      try {
        const response = await fetch(`${apiBaseUrl}/organization/elders`, {
          headers: developmentHeaders,
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const result = (await response.json()) as { data: ElderApiRecord[] };
        setElders(result.data.map(mapApiElder));
        setLoadError("");
      } catch {
        setLoadError("无法连接本地档案服务，请确认 API 已启动。");
      } finally {
        setIsLoading(false);
      }
    }
    void loadElders();
  }, []);

  async function createElder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const elderName = String(form.get("elderName") ?? "").trim();
    const contactName = String(form.get("contactName") ?? "").trim();
    const contactPhone = String(form.get("contactPhone") ?? "").trim();
    const serviceMode = String(
      form.get("serviceMode") ?? "",
    ).trim() as ElderApiRecord["serviceMode"];

    if (!elderName || !contactName || !serviceMode) {
      setFormError("请填写老人姓名、主联系人和服务形态。");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) {
      setFormError("请输入11位中国大陆手机号；模拟信息也需要符合格式。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/organization/elders`, {
        method: "POST",
        headers: developmentHeaders,
        body: JSON.stringify({
          displayName: elderName,
          primaryContactName: contactName,
          primaryContactPhone: contactPhone,
          serviceMode,
        }),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const result = (await response.json()) as { data: ElderApiRecord };
      setElders((current) => [mapApiElder(result.data), ...current]);
      setFormError("");
      setSaveNotice("模拟档案已写入本地开发数据库；刷新页面后仍会保留。");
      setIsCreateOpen(false);
      formElement.reset();
    } catch {
      setFormError("保存失败，请确认本地 API 已启动后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  async function openServicePeriods(elder: ElderRow) {
    setSelectedElder(elder);
    setPeriods([]);
    setPeriodError("");
    setIsPeriodOpen(true);
    setIsPeriodLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/organization/elders/${elder.id}/service-periods`,
        { headers: developmentHeaders },
      );
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const result = (await response.json()) as {
        data: ServicePeriodApiRecord[];
      };
      setPeriods(result.data);
    } catch {
      setPeriodError("无法读取该档案的月度服务周期。");
    } finally {
      setIsPeriodLoading(false);
    }
  }

  async function createServicePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedElder) return;
    const form = new FormData(event.currentTarget);
    const yearMonth = String(form.get("yearMonth") ?? "");
    const serviceMode = String(
      form.get("periodServiceMode") ?? "",
    ) as ElderApiRecord["serviceMode"];
    const minimumRecordCount = Number(form.get("minimumRecordCount"));
    const selfPaidYuan = Number(form.get("selfPaidYuan"));
    const voucherYuan = Number(form.get("voucherYuan"));
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth) ||
      !serviceMode ||
      !Number.isInteger(minimumRecordCount) ||
      minimumRecordCount < 1 ||
      !Number.isFinite(selfPaidYuan) ||
      selfPaidYuan < 0 ||
      !Number.isFinite(voucherYuan) ||
      voucherYuan < 0
    ) {
      setPeriodError("请检查月份、服务形态、金额和最低记录数。");
      return;
    }
    const selfPaidCents = Math.round(selfPaidYuan * 100);
    const voucherCents = Math.round(voucherYuan * 100);

    setIsPeriodSaving(true);
    setPeriodError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/organization/elders/${selectedElder.id}/service-periods`,
        {
          method: "POST",
          headers: developmentHeaders,
          body: JSON.stringify({
            yearMonth,
            serviceMode,
            minimumRecordCount,
            selfPaidCents,
            voucherCents,
            totalCents: selfPaidCents + voucherCents,
          }),
        },
      );
      if (response.status === 409) {
        setPeriodError("相同月份和服务形态的周期已经存在。");
        return;
      }
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const result = (await response.json()) as {
        data: ServicePeriodApiRecord;
      };
      setPeriods((current) => [result.data, ...current]);
      const adoptsFirstPeriod = selectedElder.status === "待建周期";
      const updatedElder: ElderRow = adoptsFirstPeriod
        ? {
            ...selectedElder,
            serviceMode: serviceModeLabels[serviceMode],
            serviceModeCode: serviceMode,
            progress: `0 / ${minimumRecordCount}`,
            status: "服务中",
          }
        : selectedElder;
      setSelectedElder(updatedElder);
      setElders((current) =>
        current.map((elder) =>
          elder.id === updatedElder.id ? updatedElder : elder,
        ),
      );
      setSaveNotice(
        `${yearMonth} 月度服务周期已保存；当前进度 0 / ${minimumRecordCount}。`,
      );
    } catch {
      setPeriodError("保存失败，请确认本地 API 已启动后重试。");
    } finally {
      setIsPeriodSaving(false);
    }
  }

  return (
    <main className="workspace-shell">
      <aside className="side-rail">
        <div className="brand-mark" aria-label="医养照护工作台">
          <span>照护</span>
          <small>机构工作台</small>
        </div>
        <nav aria-label="主要导航">
          {navigation.map(({ label, icon: Icon, active }) => (
            <button
              className={active ? "nav-item active" : "nav-item"}
              key={label}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footnote">
          <BadgeCheck size={17} aria-hidden="true" />
          <span>模拟数据环境</span>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topline">
          <div>
            <p>兰州试点机构 · 2026 年 8 月</p>
            <h1>老人档案与服务进度</h1>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setFormError("");
              setIsCreateOpen(true);
            }}
          >
            新建模拟档案
          </button>
        </header>

        <section className="status-strip" aria-label="月度状态摘要">
          <div>
            <strong>{isLoading ? "—" : elders.length}</strong>
            <span>在册老人</span>
          </div>
          <div>
            <strong>
              {elders.filter((elder) => elder.status === "服务中").length}
            </strong>
            <span>本月服务中</span>
          </div>
          <div>
            <strong>
              {elders.filter((elder) => elder.status === "待审核").length}
            </strong>
            <span>等待机构审核</span>
          </div>
          <div className="attention">
            <strong>
              {elders.filter((elder) => elder.status === "已退回").length}
            </strong>
            <span>退回待补正</span>
          </div>
        </section>

        {saveNotice ? <p className="save-notice">{saveNotice}</p> : null}
        {loadError ? (
          <p className="load-error" role="alert">
            {loadError}
          </p>
        ) : null}

        <div className="filter-row">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="搜索老人档案"
              placeholder="姓名、档案号或联系人"
            />
          </label>
          <button type="button">服务形态：全部</button>
          <button type="button">周期状态：全部</button>
          <button type="button">更多筛选</button>
        </div>

        <section className="data-region" aria-label="老人档案列表">
          <div className="table-heading table-grid">
            <span>老人 / 档案</span>
            <span>主联系人</span>
            <span>服务形态</span>
            <span>本月记录</span>
            <span>状态</span>
          </div>
          {isLoading ? (
            <p className="table-message">正在读取本地档案……</p>
          ) : null}
          {!isLoading && !loadError && elders.length === 0 ? (
            <p className="table-message">当前机构还没有老人档案。</p>
          ) : null}
          {elders.map((elder) => (
            <button
              className="table-row table-grid"
              key={elder.id}
              type="button"
              onClick={() => void openServicePeriods(elder)}
            >
              <span className="elder-name">
                <strong>{elder.name}</strong>
                <small>{elder.archiveNo}</small>
              </span>
              <span>{elder.contact}</span>
              <span>{elder.serviceMode}</span>
              <span className="progress-cell">
                <b>{elder.progress}</b>
                <i>
                  <em
                    style={{
                      width: progressWidth(elder.progress),
                    }}
                  />
                </i>
              </span>
              <span>
                <mark data-status={elder.status}>{elder.status}</mark>
              </span>
            </button>
          ))}
        </section>
      </section>

      <aside className="context-panel">
        <p className="eyebrow">当前工作重点</p>
        <h2>先补齐可核验的服务内容</h2>
        <p>
          只勾选“生活照料”等大类不足以形成完整材料。每条记录需选择具体子项目，并写明结果。
        </p>
        <div className="context-rule" />
        <dl>
          <div>
            <dt>最低记录数</dt>
            <dd>每自然月 4 条</dd>
          </div>
          <div>
            <dt>现场影像</dt>
            <dd>默认可选</dd>
          </div>
          <div>
            <dt>多人服务</dt>
            <dd>材料可共享，人员分别确认</dd>
          </div>
        </dl>
        <button className="secondary-action" type="button">
          查看本月待办
        </button>
        <p className="privacy-note">
          当前版本仅使用虚拟信息，不得录入真实身份证、健康、合同或履约影像。
        </p>
      </aside>

      {isCreateOpen ? (
        <div className="drawer-backdrop" role="presentation">
          <section
            className="create-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <header>
              <div>
                <p className="eyebrow">模拟建档</p>
                <h2 id="create-title">建立老人基础档案</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭建档窗口"
                onClick={() => setIsCreateOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <p className="drawer-warning">
              当前仅用于流程验证，请填写虚构信息。数据会写入本机开发数据库，不会上传云端。
            </p>
            <form onSubmit={createElder}>
              <label>
                <span>老人姓名</span>
                <input
                  name="elderName"
                  placeholder="例如：赵奶奶"
                  maxLength={50}
                  autoFocus
                />
              </label>
              <label>
                <span>主联系人</span>
                <input
                  name="contactName"
                  placeholder="例如：赵女士"
                  maxLength={50}
                />
              </label>
              <label>
                <span>联系人手机号</span>
                <input
                  name="contactPhone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="请输入虚构的11位手机号"
                  maxLength={11}
                />
              </label>
              <label>
                <span>服务形态</span>
                <select name="serviceMode" defaultValue="">
                  <option value="" disabled>
                    请选择
                  </option>
                  <option value="PERIODIC_HOME_VISIT">周期上门</option>
                  <option value="APPOINTMENT_HOME_VISIT">预约上门</option>
                  <option value="DAY_CARE">日托服务</option>
                  <option value="RESIDENTIAL">机构常住</option>
                  <option value="SHORT_TERM_LIVE_IN">短期住家护工</option>
                  <option value="LONG_TERM_LIVE_IN">长期住家护工</option>
                </select>
              </label>
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="drawer-actions">
                <button type="button" onClick={() => setIsCreateOpen(false)}>
                  取消
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? "正在保存……" : "保存模拟档案"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isPeriodOpen && selectedElder ? (
        <div className="drawer-backdrop" role="presentation">
          <section
            className="create-drawer period-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="period-title"
          >
            <header>
              <div>
                <p className="eyebrow">{selectedElder.archiveNo}</p>
                <h2 id="period-title">{selectedElder.name} · 月度服务</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭月度服务窗口"
                onClick={() => setIsPeriodOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <section className="period-history" aria-label="已有服务周期">
              <div className="period-section-title">
                <h3>已有周期</h3>
                <span>{periods.length} 个</span>
              </div>
              {isPeriodLoading ? <p>正在读取……</p> : null}
              {!isPeriodLoading && periods.length === 0 ? (
                <p className="empty-period">尚未建立月度周期。</p>
              ) : null}
              {periods.map((period) => (
                <article className="period-card" key={period.id}>
                  <div>
                    <strong>{period.yearMonth}</strong>
                    <span>
                      {serviceModeLabels[period.serviceMode]} · 第{" "}
                      {period.revision} 版
                    </span>
                  </div>
                  <div className="period-progress">
                    <b>
                      {period.completedRecordCount} /{" "}
                      {period.minimumRecordCount} 条
                    </b>
                    <mark data-status={periodStatusLabels[period.status]}>
                      {periodStatusLabels[period.status]}
                    </mark>
                  </div>
                  <small>
                    自费 ¥{(period.selfPaidCents / 100).toFixed(2)} · 消费券 ¥
                    {(period.voucherCents / 100).toFixed(2)} · 合计 ¥
                    {(period.totalCents / 100).toFixed(2)}
                  </small>
                  {period.id.startsWith("period-demo-") ? (
                    <small className="demo-period-note">
                      这是早期演示汇总；对应的逐条服务日志尚未建立。
                    </small>
                  ) : null}
                </article>
              ))}
            </section>

            <form className="period-form" onSubmit={createServicePeriod}>
              <div className="period-section-title">
                <h3>新建月度周期</h3>
                <span>模拟数据</span>
              </div>
              <label>
                <span>核销归属月份</span>
                <input name="yearMonth" type="month" defaultValue="2026-08" />
                <small>
                  这里按自然月归档；实际上门日期和时间记录在本月的每条服务记录中。
                </small>
              </label>
              <label>
                <span>服务形态</span>
                <select
                  name="periodServiceMode"
                  defaultValue={selectedElder.serviceModeCode}
                >
                  {Object.entries(serviceModeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="amount-grid">
                <label>
                  <span>自费金额（元）</span>
                  <input
                    name="selfPaidYuan"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
                <label>
                  <span>消费券金额（元）</span>
                  <input
                    name="voucherYuan"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
              </div>
              <label>
                <span>最低服务记录数</span>
                <input
                  name="minimumRecordCount"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue="4"
                />
                <small>当前试点默认每个自然月至少 4 条，可由机构调整。</small>
              </label>
              {periodError ? (
                <p className="form-error" role="alert">
                  {periodError}
                </p>
              ) : null}
              <div className="drawer-actions">
                <button type="button" onClick={() => setIsPeriodOpen(false)}>
                  关闭
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={isPeriodSaving}
                >
                  {isPeriodSaving ? "正在保存……" : "保存月度周期"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
