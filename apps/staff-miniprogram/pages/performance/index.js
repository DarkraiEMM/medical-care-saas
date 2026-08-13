"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({ data: { summary: null, loading: true, error: "" }, onShow() { void this.load(); }, async load() { this.setData({ loading: true, error: "" }); try {
        await (0, api_1.checkHealth)();
        const month = new Date().toISOString().slice(0, 7);
        this.setData({ summary: await (0, api_1.request)(`/staff/me/work-summary?month=${month}`), loading: false });
    }
    catch (error) {
        this.setData({ error: error instanceof Error ? error.message : "业绩加载失败", loading: false });
    } }, retry() { void this.load(); } });
//# sourceMappingURL=index.js.map