import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "corepack";
const sharedEnvironment = {
  ...process.env,
  AUTH_MODE: "local-mock",
  DATABASE_MODE: "local-sqlite",
  NODE_ENV: "development",
  PORT: "3000",
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
];

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
