declare namespace WechatMiniprogram {
  interface BaseEvent {
    currentTarget: { dataset: Record<string, unknown> };
  }
}

declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, any>): void;
declare const wx: {
  showToast(options: {
    title: string;
    icon: "none" | "success";
    duration?: number;
  }): void;
  showLoading(options: { title: string; mask?: boolean }): void;
  hideLoading(): void;
  showModal(options: {
    title: string;
    content: string;
    showCancel: boolean;
    confirmText: string;
  }): void;
  switchTab(options: { url: string }): void;
  navigateTo(options: { url: string; success?(): void; fail?(error: { errMsg: string }): void; complete?(): void }): void;
  showActionSheet(options: {
    itemList: string[];
    success(result: { tapIndex: number }): void;
  }): void;
  getStorageSync(key: string): string;
  setStorageSync(key: string, value: string): void;
  previewImage(options: { current: string; urls: string[] }): void;
  pageScrollTo(options: { selector: string; duration?: number }): void;
  request(options: {
    url: string;
    method: "GET" | "POST";
    data?: unknown;
    timeout?: number;
    header: Record<string, string>;
    success(response: { statusCode: number; data: unknown }): void;
    fail(error: { errMsg: string }): void;
  }): void;
  chooseMedia(options: {
    count: number;
    mediaType: string[];
    sourceType: string[];
  }): Promise<{ tempFiles: Array<{ tempFilePath: string; size: number }> }>;
  getFileSystemManager(): {
    readFile(options: {
      filePath: string;
      encoding: "base64";
      success(result: { data: string | ArrayBuffer }): void;
      fail(error: { errMsg: string }): void;
    }): void;
  };
  getRecorderManager(): {
    start(options: { duration: number; format: "mp3" }): void;
    stop(): void;
    onStart(callback: () => void): void;
    onStop(callback: (result: { tempFilePath: string; duration: number; fileSize: number }) => void): void;
    onError(callback: (error: { errMsg: string }) => void): void;
  };
  createCanvasContext(id: string, component?: unknown): {
    beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
    setStrokeStyle(color: string): void; setLineWidth(width: number): void; setLineCap(value: string): void;
    stroke(): void; draw(reserve?: boolean): void; clearRect(x: number, y: number, width: number, height: number): void;
  };
  canvasToTempFilePath(options: {
    canvasId: string;
    fileType: "png";
    success(result: { tempFilePath: string }): void;
    fail(error: { errMsg: string }): void;
  }, component?: unknown): void;
};
