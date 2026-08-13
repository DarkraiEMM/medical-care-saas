import { readTestFile, readTestImage, request } from "../../utils/api";

type Media = { id: string; dataUrl: string; fileName: string };
type FoodRecord = {
  id: string;
  serviceDate: string;
  ingredient: string;
  supplier: string;
  batchNo: string;
  quantity: string;
  certificate: string;
  status: string;
  returnReason: string;
  evidence: Media[];
  voice: Media | null;
};
const recorder = wx.getRecorderManager();
Page({
  data: {
    records: [] as FoodRecord[],
    editingId: "",
    editingReason: "",
    ingredient: "",
    supplier: "",
    batchNo: "",
    quantity: "",
    certificate: "",
    images: [] as Media[],
    voice: null as Media | null,
    recording: false,
    busy: false,
    loading: true,
    error: "",
    success: "",
  },
  onLoad() {
    recorder.onStart(() => this.setData({ recording: true, error: "" }));
    recorder.onStop((result) => {
      void this.uploadAudio(result);
    });
    recorder.onError((error) =>
      this.setData({ recording: false, error: error.errMsg || "录音失败" }),
    );
  },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({
        records: await request<FoodRecord[]>("/staff/food-trace-records"),
        loading: false,
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "记录加载失败",
        loading: false,
      });
    }
  },
  update(event: {
    currentTarget: { dataset: Record<string, unknown> };
    detail: { value: string };
  }) {
    this.setData({
      [String(event.currentTarget.dataset.field)]: event.detail.value,
    });
  },
  async chooseImage() {
    try {
      const result = await wx.chooseMedia({
        count: 4 - this.data.images.length,
        mediaType: ["image"],
        sourceType: ["camera", "album"],
      });
      const uploaded: Media[] = [];
      for (const file of result.tempFiles) {
        const payload = await readTestImage(
          file.tempFilePath,
          file.size,
          `食品凭证-${Date.now()}.jpg`,
        );
        uploaded.push(
          await request<Media>("/staff/media", "POST", {
            ...payload,
            mediaType: "IMAGE",
            businessType: "FOOD_TRACE",
            businessId: "DRAFT",
          }),
        );
      }
      this.setData({
        images: [...this.data.images, ...uploaded],
        success: `已添加 ${uploaded.length} 张凭证图片`,
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "图片上传失败",
      });
    }
  },
  removeImage(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id);
    this.setData({
      images: this.data.images.filter((item: Media) => item.id !== id),
    });
  },
  toggleRecord() {
    if (this.data.recording) recorder.stop();
    else recorder.start({ duration: 60000, format: "mp3" });
  },
  async uploadAudio(result: {
    tempFilePath: string;
    duration: number;
    fileSize: number;
  }) {
    try {
      const payload = await readTestFile(
        result.tempFilePath,
        result.fileSize,
        `语音备注-${Date.now()}.mp3`,
        "audio/mpeg",
      );
      const voice = await request<Media>("/staff/media", "POST", {
        ...payload,
        mediaType: "AUDIO",
        durationSeconds: Math.round(result.duration / 1000),
        businessType: "FOOD_TRACE",
        businessId: "DRAFT",
      });
      this.setData({ voice, recording: false, success: "语音备注已保存" });
    } catch (error) {
      this.setData({
        recording: false,
        error: error instanceof Error ? error.message : "语音上传失败",
      });
    }
  },
  editReturned(event: WechatMiniprogram.BaseEvent) {
    const record = this.data.records.find(
      (item: FoodRecord) => item.id === String(event.currentTarget.dataset.id),
    );
    if (!record || record.status !== "RETURNED") return;
    this.setData({
      editingId: record.id,
      editingReason: record.returnReason,
      ingredient: record.ingredient,
      supplier: record.supplier,
      batchNo: record.batchNo,
      quantity: record.quantity,
      certificate: record.certificate,
      images: record.evidence || [],
      voice: record.voice || null,
      error: "",
      success: "已载入退回记录，请按原因修改后重新提交。",
    });
    wx.pageScrollTo({ selector: ".food-form", duration: 250 });
  },
  cancelEdit() {
    this.setData({
      editingId: "",
      editingReason: "",
      ingredient: "",
      supplier: "",
      batchNo: "",
      quantity: "",
      certificate: "",
      images: [],
      voice: null,
      error: "",
      success: "",
    });
  },
  async submit() {
    if (!this.data.ingredient.trim()) {
      this.setData({ error: "请填写食材名称" });
      return;
    }
    if (!this.data.images.length) {
      this.setData({ error: "请至少拍摄一张票据、证件或批次标签" });
      return;
    }
    this.setData({ busy: true, error: "", success: "" });
    try {
      const editing = Boolean(this.data.editingId);
      await request("/staff/food-trace-records", "POST", {
        recordId: this.data.editingId || undefined,
        serviceDate: new Date().toISOString().slice(0, 10),
        ingredient: this.data.ingredient,
        supplier: this.data.supplier,
        batchNo: this.data.batchNo,
        quantity: this.data.quantity,
        certificate: this.data.certificate || "影像凭证已上传",
        evidenceIds: this.data.images.map((item: Media) => item.id),
        voiceMediaId: this.data.voice?.id || "",
      });
      this.setData({
        editingId: "",
        editingReason: "",
        ingredient: "",
        supplier: "",
        batchNo: "",
        quantity: "",
        certificate: "",
        images: [],
        voice: null,
        busy: false,
        success: editing
          ? "修改已重新提交，原记录和处理历史已保留。"
          : "流转记录已提交，等待门店复核。",
      });
      await this.load();
    } catch (error) {
      this.setData({
        busy: false,
        error: error instanceof Error ? error.message : "提交失败",
      });
    }
  },
  retry() {
    void this.load();
  },
});
