import { access } from "node:fs/promises";

const requiredFiles = [
  "app.json",
  "app.ts",
  "pages/tasks/index.json",
  "pages/tasks/index.ts",
  "pages/tasks/index.wxml",
];
await Promise.all(
  requiredFiles.map((file) => access(new URL(`../${file}`, import.meta.url))),
);
console.log("Mini program source structure is valid.");
