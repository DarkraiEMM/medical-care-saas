"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const stageLabels = {
    BEFORE: "服务前",
    DURING: "服务中",
    AFTER: "服务后",
};
const feedbackRecorder = wx.getRecorderManager();
Page({
    data: {
        taskId: "",
        task: null,
        template: null,
        serviceItemsLabel: "",
        serviceGroups: [],
        teamLabel: "",
        scheduledLabel: "",
        activeStage: "BEFORE",
        stageLabel: "服务前",
        stageNoteEnabled: false,
        stageNoteLabel: "阶段说明",
        stageNoteRequired: false,
        stageBlocks: [],
        note: "",
        locationStatus: "SIMULATED",
        images: [],
        answers: {},
        saving: false,
        uploading: false,
        uploadFeedback: "",
        error: "",
        success: "",
        returnIssues: [],
        stageIssueCounts: { BEFORE: 0, DURING: 0, AFTER: 0 },
        validationFieldId: "",
        feedbackEnabled: false,
        feedbackConfig: {},
        feedback: { evaluatorType: "ELDER", relationship: "本人", satisfaction: "", tags: [], text: "", refusalReason: "" },
        feedbackMedia: [],
        feedbackRecording: false,
        signatureReady: false,
        signatureDrawing: false,
        signaturePoint: { x: 0, y: 0 },
    },
    onLoad(options) {
        this.setData({ taskId: options.id || "" });
        feedbackRecorder.onStart(() => this.setData({ feedbackRecording: true, error: "" }));
        feedbackRecorder.onStop((result) => { void this.uploadFeedbackAudio(result); });
        feedbackRecorder.onError((error) => this.setData({ feedbackRecording: false, error: error.errMsg || "录音失败" }));
        void this.load();
    },
    async load() {
        try {
            await (0, api_1.checkHealth)();
            const task = await (0, api_1.request)(`/staff/tasks/${this.data.taskId}`);
            const template = task.templateSnapshot?.fields
                ? task.templateSnapshot
                : await (0, api_1.request)("/staff/form-template");
            const feedbackContext = await (0, api_1.request)(`/staff/tasks/${this.data.taskId}/customer-feedback`);
            const feedbackMedia = feedbackContext.feedback?.mediaIds?.length
                ? await Promise.all(feedbackContext.feedback.mediaIds.map((id) => (0, api_1.request)(`/staff/media/${id}`)))
                : [];
            const returnIssues = task.returnIssues || [];
            const stageIssueCounts = returnIssues.reduce((counts, issue) => ({ ...counts, [issue.stage]: counts[issue.stage] + (issue.resolved ? 0 : 1) }), { BEFORE: 0, DURING: 0, AFTER: 0 });
            const firstIssue = returnIssues.find((issue) => !issue.resolved);
            const serviceGroups = task.serviceItems.reduce((groups, item) => {
                const [category, child] = item.split("·");
                const existing = groups.find((group) => group.category === category);
                if (existing) {
                    existing.items.push(child || category);
                    existing.itemsLabel = existing.items.join("、");
                }
                else {
                    groups.push({
                        category,
                        items: [child || category],
                        itemsLabel: child || category,
                    });
                }
                return groups;
            }, []);
            this.setData({
                task,
                template,
                serviceItemsLabel: task.serviceItems.join("、"),
                serviceGroups,
                teamLabel: task.participantNames?.join("、") ||
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
        }
        catch (error) {
            this.setData({
                error: error instanceof Error ? error.message : "加载失败",
            });
        }
    },
    selectStage(event) {
        this.applyStage(String(event.currentTarget.dataset.stage));
    },
    applyStage(stage) {
        const value = this.data.task?.stages?.[stage];
        const presetCode = stage === "BEFORE"
            ? "SERVICE_BEFORE_NOTE"
            : stage === "DURING"
                ? "SERVICE_DURING_NOTE"
                : "SERVICE_AFTER_NOTE";
        const template = this.data.template;
        const noteField = template?.fields.find((field) => field.enabled && field.presetCode === presetCode);
        const stageFields = (template?.fields || []).filter((field) => field.enabled &&
            field.type !== "CUSTOMER_FEEDBACK" &&
            ![
                "SERVICE_BEFORE_NOTE",
                "SERVICE_DURING_NOTE",
                "SERVICE_AFTER_NOTE",
            ].includes(field.presetCode || "") &&
            (!field.evidenceStage || field.evidenceStage === stage));
        const firstImageFieldId = stageFields.find((field) => field.type === "IMAGE")?.id;
        const visibleFields = stageFields.map((field) => ({
            ...field,
            evidence: (value?.evidence || []).filter((item) => item.fieldId === field.id ||
                (!item.fieldId && field.id === firstImageFieldId)),
            issueReason: this.data.returnIssues
                .find((issue) => !issue.resolved && issue.fieldId === field.id)?.reason,
        }));
        const stageBlocks = visibleFields.reduce((blocks, field) => {
            const key = field.groupCode || field.id;
            const existing = blocks.find((block) => block.key === key);
            if (existing) {
                existing.fields.push(field);
            }
            else {
                blocks.push({
                    key,
                    label: field.groupLabel || "",
                    grouped: Boolean(field.groupCode),
                    fields: [field],
                });
            }
            return blocks;
        }, []);
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
    updateNote(event) {
        this.setData({ note: event.detail.value });
    },
    updateLocation(event) {
        this.setData({ locationStatus: event.detail.value });
    },
    updateAnswer(event) {
        const id = String(event.currentTarget.dataset.id);
        this.setData({
            answers: { ...this.data.answers, [id]: event.detail.value },
        });
    },
    updateFeedback(event) {
        const field = String(event.currentTarget.dataset.field);
        this.setData({ feedback: { ...this.data.feedback, [field]: event.detail.value } });
    },
    updateFeedbackTags(event) {
        this.setData({ feedback: { ...this.data.feedback, tags: event.detail.value } });
    },
    async chooseFeedbackImage() {
        try {
            const current = this.data.feedbackMedia.filter((item) => item.mediaType === "IMAGE");
            const result = await wx.chooseMedia({ count: Math.max(1, 3 - current.length), mediaType: ["image"], sourceType: ["camera", "album"] });
            const additions = [];
            for (const file of result.tempFiles) {
                const payload = await (0, api_1.readTestImage)(file.tempFilePath, file.size, `客户反馈-${Date.now()}.jpg`);
                additions.push(await (0, api_1.request)("/staff/media", "POST", { ...payload, mediaType: "IMAGE", businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId }));
            }
            this.setData({ feedbackMedia: [...this.data.feedbackMedia, ...additions], success: "反馈照片已保存。" });
        }
        catch (error) {
            this.setData({ error: error instanceof Error ? error.message : "照片上传失败" });
        }
    },
    toggleFeedbackRecord() { if (this.data.feedbackRecording)
        feedbackRecorder.stop();
    else
        feedbackRecorder.start({ duration: Number(this.data.feedbackConfig.maxAudioSeconds) * 1000 || 60000, format: "mp3" }); },
    async uploadFeedbackAudio(result) {
        try {
            const payload = await (0, api_1.readTestFile)(result.tempFilePath, result.fileSize, `客户语音-${Date.now()}.mp3`, "audio/mpeg");
            const media = await (0, api_1.request)("/staff/media", "POST", { ...payload, mediaType: "AUDIO", durationSeconds: Math.round(result.duration / 1000), businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId });
            this.setData({ feedbackMedia: [...this.data.feedbackMedia.filter((item) => item.mediaType !== "AUDIO"), media], feedbackRecording: false, success: "客户语音已保存。" });
        }
        catch (error) {
            this.setData({ feedbackRecording: false, error: error instanceof Error ? error.message : "语音上传失败" });
        }
    },
    signatureStart(event) {
        const point = event.touches[0];
        if (!point)
            return;
        this.setData({ signatureDrawing: true, signaturePoint: point });
    },
    signatureMove(event) {
        const point = event.touches[0];
        if (!point || !this.data.signatureDrawing)
            return;
        const context = wx.createCanvasContext("feedbackSignature", this);
        context.beginPath();
        context.moveTo(this.data.signaturePoint.x, this.data.signaturePoint.y);
        context.lineTo(point.x, point.y);
        context.setStrokeStyle("#17211b");
        context.setLineWidth(3);
        context.setLineCap("round");
        context.stroke();
        context.draw(true);
        this.setData({ signaturePoint: point, signatureReady: true });
    },
    signatureEnd() { this.setData({ signatureDrawing: false }); },
    clearSignature() { const context = wx.createCanvasContext("feedbackSignature", this); context.clearRect(0, 0, 700, 300); context.draw(); this.setData({ signatureReady: false, feedbackMedia: this.data.feedbackMedia.filter((item) => item.mediaType !== "SIGNATURE") }); },
    saveSignature() {
        if (!this.data.signatureReady) {
            this.setData({ error: "请先由老人或家属在签名区签字" });
            return;
        }
        wx.canvasToTempFilePath({ canvasId: "feedbackSignature", fileType: "png", success: (result) => { void this.uploadSignature(result.tempFilePath); }, fail: (error) => this.setData({ error: error.errMsg || "签名保存失败" }) }, this);
    },
    async uploadSignature(path) {
        try {
            const payload = await (0, api_1.readTestFile)(path, 200000, `服务确认签名-${Date.now()}.png`, "image/png");
            const media = await (0, api_1.request)("/staff/media", "POST", { ...payload, mediaType: "SIGNATURE", businessType: "CUSTOMER_FEEDBACK", businessId: this.data.taskId });
            this.setData({ feedbackMedia: [...this.data.feedbackMedia.filter((item) => item.mediaType !== "SIGNATURE"), media], success: "签名已保存。" });
        }
        catch (error) {
            this.setData({ error: error instanceof Error ? error.message : "签名上传失败" });
        }
    },
    async saveFeedback() {
        try {
            const mediaIds = this.data.feedbackMedia.map((item) => item.id);
            await (0, api_1.request)(`/staff/tasks/${this.data.taskId}/customer-feedback`, "POST", { ...this.data.feedback, mediaIds, captureMode: "STAFF_ENTERED" });
            this.setData({ success: "客户反馈已保存。", error: "" });
        }
        catch (error) {
            this.setData({ error: error instanceof Error ? error.message : "客户反馈保存失败" });
        }
    },
    async chooseImage(event) {
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
            const additions = await Promise.all(result.tempFiles.map(async (file, index) => ({
                ...(await (0, api_1.readTestImage)(file.tempFilePath, file.size, `service-${Date.now()}-${index + 1}.jpg`)),
                fieldId,
            })));
            const images = [...this.data.images, ...additions].slice(0, 6);
            this.setData({
                images,
                stageBlocks: this.data.stageBlocks.map((block) => ({
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "未选择图片";
            this.setData({ uploading: false, uploadFeedback: "" });
            if (!message.includes("cancel"))
                this.setData({ error: message });
        }
    },
    removeImage(event) {
        const url = String(event.currentTarget.dataset.url || "");
        const fieldId = String(event.currentTarget.dataset.id || "");
        const images = this.data.images.filter((item) => !(item.dataUrl === url && item.fieldId === fieldId));
        this.setData({
            images,
            stageBlocks: this.data.stageBlocks.map((block) => ({
                ...block,
                fields: block.fields.map((field) => ({
                    ...field,
                    evidence: images.filter((item) => item.fieldId === field.id),
                })),
            })),
        });
    },
    previewImage(event) {
        const current = String(event.currentTarget.dataset.url);
        wx.previewImage({
            current,
            urls: this.data.images.map((item) => item.dataUrl),
        });
    },
    async saveStage() {
        this.setData({ saving: true, error: "", success: "" });
        try {
            const task = await (0, api_1.request)(`/staff/tasks/${this.data.taskId}/stages/${this.data.activeStage}`, "POST", {
                note: this.data.note,
                locationStatus: this.data.locationStatus,
                evidence: this.data.images,
                answers: this.data.answers,
            });
            const returnIssues = task.returnIssues || [];
            const stageIssueCounts = returnIssues.reduce((counts, issue) => {
                if (!issue.resolved)
                    counts[issue.stage] += 1;
                return counts;
            }, { BEFORE: 0, DURING: 0, AFTER: 0 });
            this.setData({
                task,
                saving: false,
                success: `${this.data.stageLabel}记录已保存。`,
                returnIssues,
                stageIssueCounts,
            });
        }
        catch (error) {
            this.setData({
                saving: false,
                error: error instanceof Error ? error.message : "保存失败",
            });
        }
    },
    async submitTask() {
        this.setData({ saving: true, error: "", success: "" });
        try {
            const task = await (0, api_1.request)(`/staff/tasks/${this.data.taskId}/submit`, "POST");
            this.setData({ task, saving: false, success: "任务已提交机构审核。" });
            wx.showToast({ title: "提交成功", icon: "success", duration: 1800 });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "提交失败";
            this.setData({
                saving: false,
                error: message,
            });
            this.focusMissingField(message);
        }
    },
    focusMissingField(message) {
        const template = this.data.template;
        const field = (template?.fields || []).find((item) => message.includes(item.label));
        if (!field)
            return;
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
//# sourceMappingURL=index.js.map