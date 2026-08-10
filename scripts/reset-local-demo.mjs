import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = resolve(root, ".local-data");
const database = resolve(dataDirectory, "care-dev.sqlite");
const legacyDataDirectory = resolve(root, "apps", "api", ".local-data");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = resolve(root, ".local-backups", stamp, ".local-data");

mkdirSync(dataDirectory, { recursive: true });
if (existsSync(database)) {
  mkdirSync(backupDirectory, { recursive: true });
  for (const name of readdirSync(dataDirectory)) {
    if (name.startsWith("care-dev.sqlite")) {
      copyFileSync(resolve(dataDirectory, name), resolve(backupDirectory, name));
    }
  }
}

if (existsSync(legacyDataDirectory)) {
  const legacyBackupDirectory = resolve(
    root,
    ".local-backups",
    stamp,
    "apps-api-local-data",
  );
  mkdirSync(legacyBackupDirectory, { recursive: true });
  for (const name of readdirSync(legacyDataDirectory)) {
    if (name.startsWith("care-dev.sqlite")) {
      copyFileSync(
        resolve(legacyDataDirectory, name),
        resolve(legacyBackupDirectory, name),
      );
      rmSync(resolve(legacyDataDirectory, name));
    }
  }
}

for (const name of readdirSync(dataDirectory)) {
  if (name.startsWith("care-dev.sqlite")) rmSync(resolve(dataDirectory, name));
}

console.log("演示数据库已备份并清理；下次启动本地服务时会自动建立固定演示数据。");
