import { Controller, Get } from "@nestjs/common";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const startedAt = new Date().toISOString();

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    const databasePath = resolve(
      process.env.LOCAL_SQLITE_PATH || ".local-data/care-dev.sqlite",
    );
    return {
      status: "ok" as const,
      service: "medical-care-saas-api",
      startedAt,
      components: [
        { code: "API", label: "本地业务服务", status: "HEALTHY" },
        {
          code: "SQLITE",
          label: "本地业务数据库",
          status: existsSync(databasePath) ? "HEALTHY" : "STARTING",
        },
        {
          code: "TEST_UPLOAD",
          label: "本地文件适配器",
          status: "HEALTHY",
        },
      ],
    };
  }
}
