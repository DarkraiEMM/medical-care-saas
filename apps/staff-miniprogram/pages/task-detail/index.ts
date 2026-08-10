import { checkHealth, readTestFile, readTestImage, request } from "../../utils/api";

type StageCode = "BEFORE" | "DURING" | "AFTER";
type Evidence = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  fieldId?: string;
};
type Task = {
  id: string;
  elderName: string;
  archiveNo: string;
  scheduledAt: string;
  serviceItems: string[];
  responsibleId: string;
  responsibleName?: string;
  participantIds: string[];
  participantNames?: string[];
  status: string;
  revision: number;
  returnReason?: string;
  returnIssues?: Array<{
    stage: StageCode;
    fieldId?: string;
    fieldLabel: string;
    reason: string;
    resolved: boolean;
  }>;
  templateSnapshot?: Template;
  stages: Partial<
    Record<
      StageCode,
      {
        note: string;
        recordedAt: string;
        locationStatus: string;
        evidence: Evidence[];
      }
    >
  >;
  answers: Record<string, string | string[]>;
  stageProgress: number;
};
type TemplateField = {
  id: string;
  presetCode?: string;
  type: string;
  label: string;
  description: string;
  required: boolean;
  enabled: boolean;
  unit?: string;
  groupCode?: string;
  groupLabel?: string;
  options: Array<{ id: string; label: string }>;
  evidenceStage?: StageCode;
  issueReason?: string;
  evidence?: Evidence[];
  feedbackConfig?: Record<string, "DISABLED" | "OPTIONAL" | "REQUIRED" | number>;
};
type FeedbackMedia = { id: string; mediaType: "IMAGE" | "AUDIO" | "SIGNATURE"; dataUrl: string; fileName: string; durationSeconds?: number };
type FeedbackContext = { enabled: boolean; field: TemplateField | null; feedback: null | { evaluatorType: string; relationship: string; satisfaction: string; tags: string[]; text: string; captureMode: string; refusalReason: string; mediaIds: string[] } };
type StageBlock = {
  key: string;
  label: string;
  grouped: boolean;
  fields: TemplateField[];
};
type Template = {
  name: string;
  version: number;
  fields: TemplateField[];
};

const stageLabels: Record<StageCode, string> = {
  BEFORE: "服务前",
  DURING: "服务中",
  AFTER: "服务后",
};
const feedbackRecorder = wx.getRecorderManager();
Page({
  data: {
    taskId: "",
    task: null as Task | null,
    template: null as Template | null,
    serviceItemsLabel: "",
    serviceGroups: [] as Array<{ category: string; items: string[]; itemsLabel: string }>,
    teamLabel: "",
    scheduledLabel: "",
    activeStage: "BEFORE" as StageCode,
    stageLabel: "服务前",
    stageNoteEnabled: false,
    stageNoteLabel: "阶段说明",
    stageNoteRequired: false,
    stageBlocks: [] as StageBlock[],
    note: "",
    locationStatus: "SIMULATED",
    images: [] as Evidence[],
    answers: {} as Record<string, string | string[]>,
    saving: false,
    uploading: false,
    uploadFeedback: "",
    error: "",
    success: "",
    returnIssues: [] as NonNullable<Task["returnIssues"]>,
    stageIssueCounts: { BEFORE: 0, DURING: 0, AFTER: 0 } as Record<StageCode, number>,
    validationFieldId: "",
    feedbackEnabled: false,
    feedbackConfig: {} as Record<string, "DISABLED" | "OPTIONAL" | "REQUIRED" | number>,
    feedback: { evaluatorType: "ELDER", relationship: "本人", satisfaction: "", tags: [] as string[], text: "", refusalReason: "" },
    feedbackMedia: [] as FeedbackMedia[],
    feedbackRecording: false,
    signatureReady: false,
    signatureDrawing: false,
    signaturePoint: { x: 0, y: 0 },
  },
  onLoad(options: Record<string, string>) {
    this.setData({ taskId: options.id || "" });
    feedbackRecorder.onStart(() => this.setData({ feedbackRecording: true, error: "" }));
    feedbackRecorder.onStop((result) => { void this.uploadFeedbackAudio(result); });
    feedbackRecorder.onError((error) => this.setData({ feedbackRecording: false, error: error.errMsg || "录音失败" }));
    void this.load();
  },
  async load() {
    try {
      await checkHealth();
      const task = await request<Task>(`/staff/tasks/${this.data.taskId}`);
      const template = task.templateSnapshot?.fields
        ? task.templateSnapshot
        : await request<Template>("/staff/form-template");
      const feedbackContext = await request<FeedbackContext>(`/staff/tasks/${this.data.taskId}/customer-feedback`);
      const feedbackMedia = feedbackContext.feedback?.mediaIds?.length
        ? await Promise.all(feedbackContext.feedback.mediaIds.map((id) => request<FeedbackMedia>(`/staff/media/${id}`)))
        : [];
      const returnIssues = task.returnIssues || [];
      const stageIssueCounts = returnIssues.reduce(
        (counts, issue) => ({ ...counts, [issue.stage]: counts[issue.stage] + (issue.resolved ? 0 : 1) }),
        { BEFORE: 0, DURING: 0, AFTER: 0 } as Record<StageCode, number>,
      );
      const firstIssue = returnIssues.find((issue) => !issue.resolved);
      const serviceGroups = task.serviceItems.reduce(
        (groups: Array<{ category: string; items: string[]; itemsLabel: string }>, item) => {
          const [category, child] = item.split("·");
          const existing = groups.find((group) => group.category === category);
          if (existing) {
            existing.items.push(child || category);
            existing.itemsLabel = existing.items.join("、");
          } else {
            groups.push({
              category,
              items: [child || category],
              itemsLabel: child || category,
            });
          }
          return groups;
        },
        [],
      );
      this.setData({
        task,
        template,
        serviceItemsLabel: task.serviceItems.join("、"),
        serviceGroups,
        teamLabel:
          task.participantNames?.join("、") ||
          "无协作人员",
        scheduledLabel: new Date(task.scheduledAt).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        answers: task.answers || {},
        returnIssues,
        stageIssueCounts,
        feedbackEnabled: feedbackContext.enabled,
        feedbackConfig: feedbackContext.field?.feedbackConfig || {},
        feedback: feedbackContext.feedback ? {
          evaluatorType: feedbackContext.feedback.evaluatorType,
          relationship: feedbackContext.feedback.relationship,
          satisfaction: feedbackContext.feedback.satisfaction,
          tags: feedbackContext.feedback.tags || [],
          text: feedbackContext.feedback.text,
          refusalReason: feedbackContext.feedback.refusalReason,
        } : this.data.feedback,
        feedbackMedia,
        signatureReady: feedbackMedia.some((item) => item.mediaType === "SIGNATURE"),
      });
      this.applyStage(firstIssue?.stage || "BEFORE");
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "加载失败",
      });
    }
  },
  selectStage(event: WechatMiniprogram.BaseEvent) {
    this.applyStage(String(event.currentTarget.dataset.stage) as StageCode);
  },
  applyStage(stage: StageCode) {
    const value = this.data.task?.stages?.[stage];
    const presetCode =
      stage === "BEFORE"
        ? "SERVICE_BEFORE_NOTE"
        : stage === "DURING"
          ? "SERVICE_DURING_NOTE"
          : "SERVICE_AFTER_NOTE";
    const template = this.data.template as Template | null;
    const noteField = template?.fields.find(
      (field) => field.enabled && field.presetCode === presetCode,
    );
    const stageFields = (template?.fields || []).filter(
      (field) =>
        field.enabled &&
        field.type !== "CUSTOMER_FEEDBACK" &&
        ![
          "SERVICE_BEFORE_NOTE",
          "SERVICE_DURING_NOTE",
          "SERVICE_AFTER_NOTE",
        ].includes(field.presetCode || "") &&
        (!field.evidenceStage || field.evidenceStage === stage),
    );
    const firstImageFieldId = stageFields.find(
      (field) => field.type === "IMAGE",
    )?.id;
    const visibleFields: TemplateField[] = stageFields.map((field) => ({
      ...field,
      evidence: (value?.evidence || []).filter(
        (item: Evidence) =>
          item.fieldId === field.id ||
          (!item.fieldId && field.id === firstImageFieldId),
      ),
      issueReason: (this.data.returnIssues as NonNullable<Task["returnIssues"]>)
        .find((issue) => !issue.resolved && issue.fieldId === field.id)?.reason,
    }));
    const stageBlocks = visibleFields.reduce(
      (blocks: StageBlock[], field: TemplateField) => {
        const key = field.groupCode || field.id;
        const existing = blocks.find((block) => block.key === key);
        if (existing) {
          existing.fields.push(field);
        } else {
          blocks.push({
            key,
            label: field.groupLabel || "",
            grouped: Boolean(field.groupCode),
            fields: [field],
          });
        }
        return blocks;
      },
      [],
    );
    this.setData({
      activeStage: stage,
      stageLabel: stageLabels[stage],
      note: value?.note || "",
      stageNoteEnabled: Boolean(noteField),
      stageNoteLabel: noteField?.label || "阶段说明",
      stageNoteRequired: Boolean(noteField?.required),
      stageBlocks,
      locationStatus: value?.locationStatus || "SIMULATED",
      images: value?.evidence || [],
      error: "",
      success: "",
      validationFieldId: "",
    });
  },
  retry() {
    void this.load();
  },
  updateNote(event: { detail: { value: string } }) {
    this.setData({ note: event.detail.value });
  },
  updateLocation(event: { detail: { value: string } }) {
    this.setData({ locationStatus: event.detail.value });
  },
  updateAnswer(event: {
    currentTarget: { dataset: Record<string, unknown> };
    detail: { value: string | string[] };
  }) {
    const id = String(event.currentTarget.dataset.id);
    this.setData({
      answers: { ...this.data.answers, [id]: event.detail.value },
    });
  },
  updateFeedback(event: { currentTarget: { dataset: Record<string, unknown> }; detail: { value: string } }) {
    const field = String(event.currentTarget.dataset.field);
    this.setData({ feedback: { ...this.data.feedback, [field]: event.detail.value } });
  },
  updateFeedbackTags(event: { detail: { value: string[] } }) {
    this.setData({ feedback: { ...this.data.feedback, tags: event.detail.value } });
  },
  async chooseFeedbackImage() {
    try {
      const current = this.data.feedbackMedia.filter((item: FeedbackMedia) => item.mediaType === "IMAGE");
      const result = await wx.chooseMedia({ count: Math.max(1, 3 - current.length), mediaType: ["image"], sourceType: ["camera", "album"] });
      const additions: FeedbackMedia[] = [];
      for (const file of result.tempFiles) {
        const payload = await readTestImage(file.tempFilePath, file.size, `客户反馈-${Date.now()}.jpg`);
        additions.push(await request<FeedbackMedia>("/staff/media", "POST", { ...payload, mediaType: "IMAGE", businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId }));
      }
      this.setData({ feedbackMedia: [...this.data.feedbackMedia, ...additions], success: "反馈照片已保存。" });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : "照片上传失败" }); }
  },
  toggleFeedbackRecord() { if (this.data.feedbackRecording) feedbackRecorder.stop(); else feedbackRecorder.start({ duration: Number(this.data.feedbackConfig.maxAudioSeconds) * 1000 || 60000, format: "mp3" }); },
  async uploadFeedbackAudio(result: { tempFilePath: string; duration: number; fileSize: number }) {
    try {
      const payload = await readTestFile(result.tempFilePath, result.fileSize, `客户语音-${Date.now()}.mp3`, "audio/mpeg");
      const media = await request<FeedbackMedia>("/staff/media", "POST", { ...payload, mediaType: "AUDIO", durationSeconds: Math.round(result.duration / 1000), businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId });
      this.setData({ feedbackMedia: [...this.data.feedbackMedia.filter((item: FeedbackMedia) => item.mediaType !== "AUDIO"), media], feedbackRecording: false, success: "客户语音已保存。" });
    } catch (error) { this.setData({ feedbackRecording: false, error: error instanceof Error ? error.message : "语音上传失败" }); }
  },
  signatureStart(event: { touches: Array<{ x: number; y: number }> }) {
    const point = event.touches[0]; if (!point) return;
    this.setData({ signatureDrawing: true, signaturePoint: point });
  },
  signatureMove(event: { touches: Array<{ x: number; y: number }> }) {
    const point = event.touches[0]; if (!point || !this.data.signatureDrawing) return;
    const context = wx.createCanvasContext("feedbackSignature", this);
    context.beginPath(); context.moveTo(this.data.signaturePoint.x, this.data.signaturePoint.y); context.lineTo(point.x, point.y);
    context.setStrokeStyle("#17211b"); context.setLineWidth(3); context.setLineCap("round"); context.stroke(); context.draw(true);
    this.setData({ signaturePoint: point, signatureReady: true });
  },
  signatureEnd() { this.setData({ signatureDrawing: false }); },
  clearSignature() { const context = wx.createCanvasContext("feedbackSignature", this); context.clearRect(0, 0, 700, 300); context.draw(); this.setData({ signatureReady: false, feedbackMedia: this.data.feedbackMedia.filter((item: FeedbackMedia) => item.mediaType !== "SIGNATURE") }); },
  saveSignature() {
    if (!this.data.signatureReady) { this.setData({ error: "请先由老人或家属在签名区签字" }); return; }
    wx.canvasToTempFilePath({ canvasId: "feedbackSignature", fileType: "png", success: (result) => { void this.uploadSignature(result.tempFilePath); }, fail: (error) => this.setData({ error: error.errMsg || "签名保存失败" }) }, this);
  },
  async uploadSignature(path: string) {
    try { const payload = await readTestFile(path, 200000, `服务确认签名-${Date.now()}.png`, "image/png"); const media = await request<FeedbackMedia>("/staff/media", "POST", { ...payload, mediaType: "SIGNATURE", businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId }); this.setData({ feedbackMedia: [...this.data.feedbackMedia.filter((item: FeedbackMedia) => item.mediaType !== "SIGNATURE"), media], success: "签名已保存。" }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : "签名上传失败" }); }
  },
  async saveFeedback() {
    try { const mediaIds = this.data.feedbackMedia.map((item: FeedbackMedia) => item.id); await request(`/staff/tasks/${this.data.taskId}/customer-feedback`, "POST", { ...this.data.feedback, mediaIds, captureMode: "STAFF_ENTERED" }); this.setData({ success: "客户反馈已保存。", error: "" }); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : "客户反馈保存失败" }); }
  },
  async chooseImage(event: WechatMiniprogram.BaseEvent) {
    const fieldId = String(event.currentTarget.dataset.id || "");
    try {
      this.setData({
        uploading: true,
        uploadFeedback: "正在读取图片…",
        error: "",
      });
      const result = await wx.chooseMedia({
        count: 3,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });
      const additions = await Promise.all(
        result.tempFiles.map(async (file, index) => ({
          ...(await readTestImage(
            file.tempFilePath,
            file.size,
            `service-${Date.now()}-${index + 1}.jpg`,
          )),
          fieldId,
        })),
      );
      const images = [...this.data.images, ...additions].slice(0, 6);
      this.setData({
        images,
        stageBlocks: this.data.stageBlocks.map((block: StageBlock) => ({
          ...block,
          fields: block.fields.map((field) => ({
            ...field,
            evidence: images.filter((item) => item.fieldId === field.id),
          })),
        })),
        uploading: false,
        uploadFeedback: `已选择${additions.length}张图片`,
        error: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未选择图片";
      this.setData({ uploading: false, uploadFeedback: "" });
      if (!message.includes("cancel")) this.setData({ error: message });
    }
  },
  removeImage(event: WechatMiniprogram.BaseEvent) {
    const url = String(event.currentTarget.dataset.url || "");
    const fieldId = String(event.currentTarget.dataset.id || "");
    const images = this.data.images.filter(
      (item: Evidence) => !(item.dataUrl === url && item.fieldId === fieldId),
    );
    this.setData({
      images,
      stageBlocks: this.data.stageBlocks.map((block: StageBlock) => ({
        ...block,
        fields: block.fields.map((field) => ({
          ...field,
          evidence: images.filter((item: Evidence) => item.fieldId === field.id),
        })),
      })),
    });
  },
  previewImage(event: WechatMiniprogram.BaseEvent) {
    const current = String(event.currentTarget.dataset.url);
    wx.previewImage({
      current,
      urls: this.data.images.map((item: Evidence) => item.dataUrl),
    });
  },
  async saveStage() {
    this.setData({ saving: true, error: "", success: "" });
    try {
      const task = await request<Task>(
        `/staff/tasks/${this.data.taskId}/stages/${this.data.activeStage}`,
        "POST",
        {
          note: this.data.note,
          locationStatus: this.data.locationStatus,
          evidence: this.data.images,
          answers: this.data.answers,
        },
      );
      const returnIssues = task.returnIssues || [];
      const stageIssueCounts = returnIssues.reduce(
        (counts, issue) => {
          if (!issue.resolved) counts[issue.stage] += 1;
          return counts;
        },
        { BEFORE: 0, DURING: 0, AFTER: 0 } as Record<StageCode, number>,
      );
      this.setData({
        task,
        saving: false,
        success: `${this.data.stageLabel}记录已保存。`,
        returnIssues,
        stageIssueCounts,
      });
    } catch (error) {
      this.setData({
        saving: false,
        error: error instanceof Error ? error.message : "保存失败",
      });
    }
  },
  async submitTask() {
    this.setData({ saving: true, error: "", success: "" });
    try {
      const task = await request<Task>(
        `/staff/tasks/${this.data.taskId}/submit`,
        "POST",
      );
      this.setData({ task, saving: false, success: "任务已提交机构审核。" });
      wx.showToast({ title: "提交成功", icon: "success", duration: 1800 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败";
      this.setData({
        saving: false,
        error: message,
      });
      this.focusMissingField(message);
    }
  },
  focusMissingField(message: string) {
    const template = this.data.template as Template | null;
    const field = (template?.fields || []).find((item) => message.includes(item.label));
    if (!field) return;
    const stage = field.evidenceStage || "DURING";
    this.applyStage(stage);
    this.setData({ validationFieldId: field.id });
    setTimeout(() => {
      wx.pageScrollTo({ selector: `#field-${field.id}`, duration: 250 });
    }, 80);
  },
  backToTasks() {
    wx.switchTab({ url: "/pages/tasks/index" });
  },
});
