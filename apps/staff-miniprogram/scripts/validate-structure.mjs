import { access, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";

const requiredFiles = [
  "app.json",
  "app.ts",
  "pages/tasks/index.json",
  "pages/tasks/index.ts",
  "pages/tasks/index.wxml",
  "pages/task-detail/index.json",
  "pages/task-detail/index.ts",
  "pages/task-detail/index.wxml",
  "pages/corrections/index.json",
  "pages/corrections/index.ts",
  "pages/corrections/index.wxml",
  "pages/profile/index.json",
  "pages/profile/index.ts",
  "pages/profile/index.wxml",
];
const compiledPageScripts = [
  "pages/tasks/index.js",
  "pages/task-detail/index.js",
  "pages/corrections/index.js",
  "pages/profile/index.js",
];
await Promise.all(
  requiredFiles.map((file) => access(new URL(`../${file}`, import.meta.url))),
);
await Promise.all(
  compiledPageScripts.map((file) =>
    access(new URL(`../${file}`, import.meta.url)),
  ),
);
const projectConfig = JSON.parse(
  readFileSync(new URL("../project.config.json", import.meta.url), "utf8"),
);
const appConfig = JSON.parse(
  readFileSync(new URL("../app.json", import.meta.url), "utf8"),
);
if (projectConfig.setting?.useCompilerPlugins?.includes("typescript")) {
  throw new Error(
    "小程序应加载仓库构建生成的 JavaScript，不应启用开发者工具内置 TypeScript 编译插件。",
  );
}
if (projectConfig.appid === "touristappid" || !projectConfig.appid) {
  throw new Error(
    "project.config.json 必须使用已登记的小程序 AppID。",
  );
}
if (appConfig.lazyCodeLoading === "requiredComponents") {
  throw new Error('当前开发者工具存在按需注入路由超时，演示版暂不启用 lazyCodeLoading。');
}

async function listWxmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...(await listWxmlFiles(target)));
    else if (entry.name.endsWith(".wxml")) files.push(target);
  }
  return files;
}

const wxmlFiles = await listWxmlFiles(new URL("../pages/", import.meta.url));
for (const file of wxmlFiles) {
  const source = readFileSync(file, "utf8");
  const openingTags = source.match(/<[^!/][^>]*>/g) || [];
  for (const tag of openingTags) {
    if (
      tag.includes("wx:if=") &&
      tag.includes("wx:for=") &&
      source.includes("wx:else")
    ) {
      throw new Error(
        `${file.pathname}：不要在同一元素同时使用 wx:if 与 wx:for 后再连接 wx:else；请用 block 包裹条件分支。`,
      );
    }
  }
  if (/wx:else\s*=/.test(source)) {
    throw new Error(`${file.pathname}：wx:else 不允许设置属性值。`);
  }
}

console.log("小程序源码结构和基础 WXML 规则校验通过。");
