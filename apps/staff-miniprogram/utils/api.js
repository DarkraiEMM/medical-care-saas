"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDemoActorId = getDemoActorId;
exports.setDemoActorId = setDemoActorId;
exports.checkHealth = checkHealth;
exports.request = request;
exports.readTestImage = readTestImage;
exports.readTestFile = readTestFile;
const API_BASE = "http://127.0.0.1:3000/api/v1";
const DEFAULT_DEMO_ACTOR_ID = "staff-lz-001";
const DEMO_ACTOR_STORAGE_KEY = "care-demo-actor-id";
function getDemoActorId() {
    return wx.getStorageSync(DEMO_ACTOR_STORAGE_KEY) || DEFAULT_DEMO_ACTOR_ID;
}
function setDemoActorId(actorId) {
    wx.setStorageSync(DEMO_ACTOR_STORAGE_KEY, actorId);
}
function requestHeaders() {
    return {
        "content-type": "application/json",
        "x-dev-tenant-id": "tenant-lanzhou-pilot",
        "x-dev-role": "FRONTLINE_STAFF",
        "x-dev-actor-id": getDemoActorId(),
    };
}
function checkHealth() {
    return new Promise((resolve, reject) => {
        wx.request({
            url: `${API_BASE}/health?_ts=${Date.now()}`,
            method: "GET",
            timeout: 3000,
            header: requestHeaders(),
            success(response) {
                if (response.statusCode >= 200 && response.statusCode < 300)
                    resolve();
                else
                    reject(new Error("业务服务尚未准备完成，请稍后重新连接。"));
            },
            fail() {
                reject(new Error("业务服务尚未启动，请先运行“启动本地演示”。"));
            },
        });
    });
}
function request(path, method = "GET", data) {
    return new Promise((resolve, reject) => {
        const requestPath = method === "GET"
            ? `${path}${path.includes("?") ? "&" : "?"}_ts=${Date.now()}`
            : path;
        wx.request({
            url: `${API_BASE}${requestPath}`,
            method,
            data: method === "POST" && data === undefined ? {} : data,
            timeout: 10000,
            header: requestHeaders(),
            success(response) {
                const body = response.data;
                if (response.statusCode >= 200 && response.statusCode < 300 && body.data !== undefined)
                    resolve(body.data);
                else
                    reject(new Error(typeof body.message === "string" ? body.message : "服务请求失败，请稍后重试"));
            },
            fail(error) {
                const detail = String(error.errMsg || "");
                reject(new Error(detail.includes("timeout")
                    ? "业务服务连接超时，请确认“启动本地演示”窗口仍在运行。"
                    : "业务服务连接已中断，请先运行“启动本地演示”。"));
            },
        });
    });
}
function readTestImage(path, size, fileName) {
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
function readTestFile(path, size, fileName, mimeType) {
    return new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
            filePath: path,
            encoding: "base64",
            success(result) { resolve({ fileName, mimeType, sizeBytes: size, dataUrl: `data:${mimeType};base64,${String(result.data)}` }); },
            fail(error) { reject(new Error(error.errMsg || "文件读取失败，请重新选择")); },
        });
    });
}
//# sourceMappingURL=api.js.map