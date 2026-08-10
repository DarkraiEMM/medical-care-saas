const API_BASE = "http://127.0.0.1:3000/api/v1";
const DEFAULT_DEMO_ACTOR_ID = "staff-lz-001";
const DEMO_ACTOR_STORAGE_KEY = "care-demo-actor-id";

export function getDemoActorId(): string {
  return wx.getStorageSync(DEMO_ACTOR_STORAGE_KEY) || DEFAULT_DEMO_ACTOR_ID;
}

export function setDemoActorId(actorId: string): void {
  wx.setStorageSync(DEMO_ACTOR_STORAGE_KEY, actorId);
}

function requestHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-dev-tenant-id": "tenant-lanzhou-pilot",
    "x-dev-role": "FRONTLINE_STAFF",
    "x-dev-actor-id": getDemoActorId(),
  };
}

export function checkHealth(): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/health?_ts=${Date.now()}`,
      method: "GET",
      timeout: 3000,
      header: requestHeaders(),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error("业务服务尚未准备完成，请稍后重新连接。"));
      },
      fail() {
        reject(new Error("业务服务尚未启动，请先运行“启动本地演示”。"));
      },
    });
  });
}

export function request<T>(path: string, method: "GET" | "POST" = "GET", data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestPath =
      method === "GET"
        ? `${path}${path.includes("?") ? "&" : "?"}_ts=${Date.now()}`
        : path;
    wx.request({
      url: `${API_BASE}${requestPath}`,
      method,
      data: method === "POST" && data === undefined ? {} : data,
      timeout: 10000,
      header: requestHeaders(),
      success(response) {
        const body = response.data as { data?: T; message?: unknown };
        if (response.statusCode >= 200 && response.statusCode < 300 && body.data !== undefined) resolve(body.data);
        else reject(new Error(typeof body.message === "string" ? body.message : "服务请求失败，请稍后重试"));
      },
      fail(error) {
        const detail = String(error.errMsg || "");
        reject(
          new Error(
            detail.includes("timeout")
              ? "业务服务连接超时，请确认“启动本地演示”窗口仍在运行。"
              : "业务服务连接已中断，请先运行“启动本地演示”。",
          ),
        );
      },
    });
  });
}

export function readTestImage(path: string, size: number, fileName: string): Promise<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success(result) {
        const mimeType = fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        resolve({ fileName, mimeType, sizeBytes: size, dataUrl: `data:${mimeType};base64,${String(result.data)}` });
      },
      fail(error) { reject(new Error(error.errMsg || "图片读取失败，请重新选择")); },
    });
  });
}

export function readTestFile(path: string, size: number, fileName: string, mimeType: string): Promise<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success(result) { resolve({ fileName, mimeType, sizeBytes: size, dataUrl: `data:${mimeType};base64,${String(result.data)}` }); },
      fail(error) { reject(new Error(error.errMsg || "文件读取失败，请重新选择")); },
    });
  });
}
