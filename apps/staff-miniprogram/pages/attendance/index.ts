import { checkHealth, request } from "../../utils/api";

type Attendance = { enabled: boolean; policy?: { startTime: string; endTime: string; locationRadiusMeters: number }; record: null | { workDate: string; checkInAt?: string; checkOutAt?: string; locationStatus: string } };
Page({
  data: { attendance: null as Attendance | null, loading: true, busy: false, error: "", success: "" },
  onShow() { void this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try { await checkHealth(); this.setData({ attendance: await request<Attendance>("/staff/attendance/today"), loading: false }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : "考勤记录加载失败", loading: false }); }
  },
  retry() { void this.load(); },
  async check(event: WechatMiniprogram.BaseEvent) {
    const action = String(event.currentTarget.dataset.action);
    this.setData({ busy: true, error: "", success: "" });
    try {
      const attendance = await request<Attendance>("/staff/attendance/check", "POST", { action, locationStatus: "SIMULATED" });
      this.setData({ attendance, busy: false, success: action === "CHECK_IN" ? "上班打卡已记录。" : "下班打卡已记录。" });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : "打卡失败", busy: false }); }
  },
});
