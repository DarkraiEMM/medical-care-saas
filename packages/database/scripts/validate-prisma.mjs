import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "prisma.cmd" : "prisma";
const result = spawnSync(command, ["validate"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "mysql://schema_validation:schema_validation@127.0.0.1:3306/schema_validation",
  },
});

process.exit(result.status ?? 1);
