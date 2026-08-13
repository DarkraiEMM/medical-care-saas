"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { attendance: null, loading: true, busy: false, error: "", success: "" },
    onShow() { void this.load(); },
    async load() {
        this.setData({ loading: true, error: "" });
        try {
            await (0, api_1.checkHealth)();
            this.setData({ attendance: await (0, api_1.request)("/staff/attendance/today"), loading: false });
        }
        catch (error) {
            this.setData({ error: error instanceof Error ? error.message : "考勤记录加载失败", loading: false });
        }
    },
    retry() { void this.load(); },
    async check(event) {
        const action = String(event.currentTarget.dataset.action);
        this.setData({ busy: true, error: "", success: "" });
        try {
            const attendance = await (0, api_1.request)("/staff/attendance/check", "POST", { action, locationStatus: "SIMULATED" });
            this.setData({ attendance, busy: false, success: action === "CHECK_IN" ? "上班打卡已记录。" : "下班打卡已记录。" });
        }
        catch (error) {
            this.setData({ error: error instanceof Error ? error.message : "打卡失败", busy: false });
        }
    },
});
//# sourceMappingURL=index.js.map