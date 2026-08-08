import {
  Archive,
  BadgeCheck,
  ClipboardList,
  FileArchive,
  LayoutDashboard,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";

const elders = [
  {
    name: "张奶奶（模拟）",
    archiveNo: "DEMO-2026-001",
    serviceMode: "周期上门",
    progress: "2 / 4",
    status: "服务中",
    contact: "张女士 · 138****1208",
  },
  {
    name: "李爷爷（模拟）",
    archiveNo: "DEMO-2026-002",
    serviceMode: "日托服务",
    progress: "4 / 4",
    status: "待审核",
    contact: "李先生 · 139****3306",
  },
  {
    name: "王奶奶（模拟）",
    archiveNo: "DEMO-2026-003",
    serviceMode: "预约上门",
    progress: "4 / 4",
    status: "已退回",
    contact: "王女士 · 136****7811",
  },
];

const navigation = [
  { label: "今日概览", icon: LayoutDashboard },
  { label: "老人档案", icon: UsersRound, active: true },
  { label: "服务记录", icon: ClipboardList },
  { label: "合同档案", icon: Archive },
  { label: "核销材料", icon: FileArchive },
  { label: "机构设置", icon: Settings },
];

export function App() {
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
          <button className="primary-action" type="button">
            新建模拟档案
          </button>
        </header>

        <section className="status-strip" aria-label="月度状态摘要">
          <div>
            <strong>36</strong>
            <span>在册老人</span>
          </div>
          <div>
            <strong>11</strong>
            <span>本月服务中</span>
          </div>
          <div>
            <strong>5</strong>
            <span>等待机构审核</span>
          </div>
          <div className="attention">
            <strong>2</strong>
            <span>退回待补正</span>
          </div>
        </section>

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
          {elders.map((elder) => (
            <button
              className="table-row table-grid"
              key={elder.archiveNo}
              type="button"
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
                      width: elder.progress === "2 / 4" ? "50%" : "100%",
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
    </main>
  );
}
