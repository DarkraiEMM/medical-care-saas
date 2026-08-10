"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const labels = {
    NOT_STARTED: "待开始",
    IN_PROGRESS: "服务中",
    PENDING_REVIEW: "待审核",
    RETURNED: "待修改",
    APPROVED: "已完成",
};
Page({
    data: {
        tasks: [],
        taskGroups: [],
        loading: true,
        error: "",
        taskStats: { notStarted: 0, inProgress: 0, returned: 0 },
    },
    onShow() {
        void this.loadTasks();
    },
    async loadTasks() {
        this.setData({ loading: true, error: "" });
        try {
            await (0, api_1.checkHealth)();
            const tasks = await (0, api_1.request)("/staff/tasks");
            const mapped = tasks.map((task) => {
                const collaborators = (task.participantNames || []).filter((name) => name !== task.responsibleName);
                return {
                    ...task,
                    date: new Date(task.scheduledAt).toLocaleDateString("zh-CN", {
                        month: "long",
                        day: "numeric",
                        timeZone: "Asia/Shanghai",
                    }),
                    time: new Date(task.scheduledAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: "Asia/Shanghai",
                    }),
                    statusLabel: labels[task.status] || "状态待确认",
                    serviceItemsLabel: task.serviceItems.join("、"),
                    teamLabel: collaborators.length ? collaborators.join("、") : "无协作人员",
                };
            });
            const taskGroups = mapped.reduce((groups, task) => {
                const group = groups.find((item) => item.date === task.date);
                if (group)
                    group.tasks.push(task);
                else
                    groups.push({ date: task.date, tasks: [task] });
                return groups;
            }, []);
            this.setData({
                tasks: mapped,
                taskGroups,
                loading: false,
                taskStats: {
                    notStarted: mapped.filter((task) => task.status === "NOT_STARTED").length,
                    inProgress: mapped.filter((task) => task.status === "IN_PROGRESS").length,
                    returned: mapped.filter((task) => task.status === "RETURNED").length,
                },
            });
        }
        catch (error) {
            this.setData({
                error: error instanceof Error ? error.message : "任务加载失败",
                loading: false,
            });
        }
    },
    retry() {
        void this.loadTasks();
    },
});
//# sourceMappingURL=index.js.map