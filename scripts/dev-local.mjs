import { spawn } from "node:child_process";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "corepack";
const sharedEnvironment = {
  ...process.env,
  AUTH_MODE: "local-mock",
  DATABASE_MODE: "local-sqlite",
  NODE_ENV: "development",
  PORT: "3000",
  LOCAL_SQLITE_PATH: resolve(".local-data/care-dev.sqlite"),
};

function pnpmArguments(argumentsList) {
  if (!isWindows) return ["pnpm", ...argumentsList];
  return ["/d", "/s", "/c", `corepack pnpm ${argumentsList.join(" ")}`];
}

const children = [
  spawn(command, pnpmArguments(["--filter", "@care/api", "dev"]), {
    env: sharedEnvironment,
    stdio: "inherit",
  }),
  spawn(
    command,
    pnpmArguments([
      "--filter",
      "@care/organization-web",
      "dev",
      "--host",
      "127.0.0.1",
    ]),
    {
      env: sharedEnvironment,
      stdio: "inherit",
    },
  ),
  spawn(
    command,
    pnpmArguments([
      "--filter",
      "@care/platform-web",
      "dev",
      "--host",
      "127.0.0.1",
    ]),
    {
      env: sharedEnvironment,
      stdio: "inherit",
    },
  ),
];

async function waitFor(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // 服务仍在启动，继续等待。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return false;
}

async function openWorkspace() {
  const targets = [
    ["业务 API", "http://127.0.0.1:3000/api/v1/health"],
    ["机构工作台", "http://127.0.0.1:5173/"],
    ["平台工作台", "http://127.0.0.1:5174/"],
  ];
  const ready = await Promise.all(
    targets.map(async ([label, url]) => ({ label, url, ok: await waitFor(url) })),
  );
  const failed = ready.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`本地服务未能完整启动：${failed.map((item) => item.label).join("、")}`);
    console.error("请检查当前窗口中更早出现的端口占用或编译错误。");
    return;
  }
  console.log("\n本地服务已就绪：");
  console.log("机构工作台  http://127.0.0.1:5173/");
  console.log("平台工作台  http://127.0.0.1:5174/");
  console.log("微信小程序可在开发者工具中点击“重新编译”后使用。\n");
  if (isWindows) {
    for (const url of ["http://127.0.0.1:5173/", "http://127.0.0.1:5174/"]) {
      const opener = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      opener.unref();
    }
  }
}

void openWorkspace();

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
