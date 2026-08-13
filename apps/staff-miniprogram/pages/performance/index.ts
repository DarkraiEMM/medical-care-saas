import { checkHealth, request } from "../../utils/api";
type Summary = {
  month: string;
  workload: Record<string, number | string>;
  statement: null | { schemeName: string; status: string; totalPoints: number };
  policy: {
    name: string;
    version: number;
    calculationNote: string;
    sourceDepartments: string[];
    sourceDepartmentLabel: string;
    totalPoints: number;
    lines: Array<{ metricCode: string; label: string; quantity: number; unit: string; pointsPerUnit: number; points: number }>;
  };
};
Page({ data: { summary: null as Summary | null, loading: true, error: "" }, onShow() { void this.load(); }, async load() { this.setData({ loading: true, error: "" }); try { await checkHealth(); const month = new Date().toISOString().slice(0,7); this.setData({ summary: await request<Summary>(`/staff/me/work-summary?month=${month}`), loading: false }); } catch (error) { this.setData({ error: error instanceof Error ? error.message : "业绩加载失败", loading: false }); } }, retry() { void this.load(); } });
