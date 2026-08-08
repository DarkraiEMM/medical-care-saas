interface TaskItem {
  id: string;
  elderName: string;
  time: string;
  serviceItems: string;
  progress: string;
  status: "待开始" | "进行中" | "待补正";
}

Page({
  data: {
    dateLabel: "8 月 8 日 · 星期六",
    tasks: [
      {
        id: "demo-task-1",
        elderName: "张奶奶（模拟）",
        time: "09:30",
        serviceItems: "居室清洁、物品整理",
        progress: "0 / 3 阶段",
        status: "待开始",
      },
      {
        id: "demo-task-2",
        elderName: "李爷爷（模拟）",
        time: "14:00",
        serviceItems: "测量血压、陪同散步",
        progress: "2 / 3 阶段",
        status: "进行中",
      },
    ] as TaskItem[],
  },
  openTask(event: WechatMiniprogram.BaseEvent): void {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    wx.showToast({ title: `模拟任务 ${taskId.slice(-1)}`, icon: "none" });
  },
});
