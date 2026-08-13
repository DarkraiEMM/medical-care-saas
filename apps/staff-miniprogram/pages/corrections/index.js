"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({ data: { tasks: [], error: "", loading: true }, onShow() { void this.load(); }, async load() { this.setData({ loading: true, error: "" }); try {
        await (0, api_1.checkHealth)();
        const rows = await (0, api_1.request)("/staff/tasks");
        this.setData({ tasks: rows.filter((item) => item.status === "RETURNED").map((item) => ({ ...item, serviceItemsLabel: item.serviceItems.join("、") })), error: "", loading: false });
    }
    catch (error) {
        this.setData({ error: error instanceof Error ? error.message : "加载失败", loading: false });
    } }, retry() { void this.load(); }, openTask(event) { wx.navigateTo({ url: `/pages/task-detail/index?id=${String(event.currentTarget.dataset.id)}` }); } });
//# sourceMappingURL=index.js.map