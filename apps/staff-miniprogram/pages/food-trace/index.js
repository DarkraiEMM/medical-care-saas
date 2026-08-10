"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const recorder = wx.getRecorderManager();
Page({
    data: { records: [], ingredient: "", supplier: "", batchNo: "", quantity: "", certificate: "", images: [], voice: null, recording: false, busy: false, loading: true, error: "", success: "" },
    onLoad() {
        recorder.onStart(() => this.setData({ recording: true, error: "" }));
        recorder.onStop((result) => { void this.uploadAudio(result); });
        recorder.onError((error) => this.setData({ recording: false, error: error.errMsg || "录音失败" }));
    },
    onShow() { void this.load(); },
    async load() { this.setData({ loading: true, error: "" }); try {
        this.setData({ records: await (0, api_1.request)("/staff/food-trace-records"), loading: false });
    }
    catch (error) {
        this.setData({ error: error instanceof Error ? error.message : "记录加载失败", loading: false });
    } },
    update(event) { this.setData({ [String(event.currentTarget.dataset.field)]: event.detail.value }); },
    async chooseImage() { try {
        const result = await wx.chooseMedia({ count: 4 - this.data.images.length, mediaType: ["image"], sourceType: ["camera", "album"] });
        const uploaded = [];
        for (const file of result.tempFiles) {
            const payload = await (0, api_1.readTestImage)(file.tempFilePath, file.size, `食品凭证-${Date.now()}.jpg`);
            uploaded.push(await (0, api_1.request)("/staff/media", "POST", { ...payload, mediaType: "IMAGE", businessType: "FOOD_TRACE", businessId: "DRAFT" }));
        }
        this.setData({ images: [...this.data.images, ...uploaded], success: `已添加 ${uploaded.length} 张凭证图片` });
    }
    catch (error) {
        this.setData({ error: error instanceof Error ? error.message : "图片上传失败" });
    } },
    removeImage(event) { const id = String(event.currentTarget.dataset.id); this.setData({ images: this.data.images.filter((item) => item.id !== id) }); },
    toggleRecord() { if (this.data.recording)
        recorder.stop();
    else
        recorder.start({ duration: 60000, format: "mp3" }); },
    async uploadAudio(result) { try {
        const payload = await (0, api_1.readTestFile)(result.tempFilePath, result.fileSize, `语音备注-${Date.now()}.mp3`, "audio/mpeg");
        const voice = await (0, api_1.request)("/staff/media", "POST", { ...payload, mediaType: "AUDIO", durationSeconds: Math.round(result.duration / 1000), businessType: "FOOD_TRACE", businessId: "DRAFT" });
        this.setData({ voice, recording: false, success: "语音备注已保存" });
    }
    catch (error) {
        this.setData({ recording: false, error: error instanceof Error ? error.message : "语音上传失败" });
    } },
    async submit() { if (!this.data.ingredient.trim()) {
        this.setData({ error: "请填写食材名称" });
        return;
    } if (!this.data.images.length) {
        this.setData({ error: "请至少拍摄一张票据、证件或批次标签" });
        return;
    } this.setData({ busy: true, error: "", success: "" }); try {
        await (0, api_1.request)("/staff/food-trace-records", "POST", { serviceDate: new Date().toISOString().slice(0, 10), ingredient: this.data.ingredient, supplier: this.data.supplier, batchNo: this.data.batchNo, quantity: this.data.quantity, certificate: this.data.certificate || "影像凭证已上传", evidenceIds: this.data.images.map((item) => item.id), voiceMediaId: this.data.voice?.id || "" });
        this.setData({ ingredient: "", supplier: "", batchNo: "", quantity: "", certificate: "", images: [], voice: null, busy: false, success: "流转记录已提交，等待门店复核。" });
        await this.load();
    }
    catch (error) {
        this.setData({ busy: false, error: error instanceof Error ? error.message : "提交失败" });
    } },
    retry() { void this.load(); },
});
//# sourceMappingURL=index.js.map