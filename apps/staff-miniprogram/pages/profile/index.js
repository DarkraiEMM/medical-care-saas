"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: {
        profile: null,
        error: "",
        loading: true,
        attendanceEnabled: false,
        foodTraceEnabled: false,
        attendanceHint: "查看今日记录并打卡",
        performanceHint: "查看本月工作量和积分明细",
        attendancePolicyName: "",
        performancePolicyName: "",
        foodTraceHint: "拍摄票据、证件和批次标签",
        approvedTasks: 0,
        serviceDays: 0,
        pendingTasks: 0,
        totalPoints: 0,
        switchingIdentity: false,
    },
    onLoad() {
        void this.load();
    },
    async load() {
        this.setData({ loading: true, error: "" });
        try {
            await (0, api_1.checkHealth)();
            const [profile, applications, summary] = await Promise.all([
                (0, api_1.request)("/staff/directory-profile"),
                (0, api_1.request)("/staff/applications"),
                (0, api_1.request)("/staff/me/work-summary"),
            ]);
            const attendance = applications.attendance.enabled
                ? await (0, api_1.request)("/staff/attendance/today")
                : { enabled: false, record: null };
            const attendanceHint = attendance.record?.checkOutAt
                ? "今日上下班记录已完成"
                : attendance.record?.checkInAt
                    ? "已上班打卡，等待下班打卡"
                    : "今天尚未上班打卡";
            this.setData({
                profile: {
                    ...profile,
                    departmentLabel: profile.departments.join("、"),
                },
                attendanceEnabled: applications.attendance.enabled,
                foodTraceEnabled: applications.foodTrace.enabled,
                attendanceHint,
                attendancePolicyName: applications.attendance.policyName || "门店考勤规则",
                performancePolicyName: summary.policy.name,
                performanceHint: `本月按当前演示规则计 ${summary.policy.totalPoints} 分，查看计算依据`,
                foodTraceHint: applications.foodTrace.description || "拍摄票据、证件和批次标签",
                approvedTasks: summary.workload.approvedTasks,
                serviceDays: summary.workload.serviceDays,
                pendingTasks: summary.workload.pendingTasks,
                totalPoints: summary.policy.totalPoints,
                loading: false,
            });
        }
        catch (error) {
            this.setData({
                error: error instanceof Error ? error.message : "身份加载失败",
                loading: false,
            });
        }
    },
    retry() {
        void this.load();
    },
    switchDemoIdentity() {
        if (this.data.switchingIdentity)
            return;
        wx.showActionSheet({
            itemList: ["刘阿姨｜护理部、上门服务组", "陈师傅｜餐饮部"],
            success: (result) => {
                (0, api_1.setDemoActorId)(result.tapIndex === 1 ? "staff-lz-003" : "staff-lz-001");
                this.setData({ switchingIdentity: true });
                void this.load().finally(() => this.setData({ switchingIdentity: false }));
            },
        });
    },
    showPrivacy() {
        wx.showModal({
            title: "隐私说明",
            content: "仅收集完成机构服务任务所需的信息。服务记录由机构按保存规则管理，平台人员无权常态查看业务正文。",
            showCancel: false,
            confirmText: "知道了",
        });
    },
});
//# sourceMappingURL=index.js.map