# 医养照护 SaaS

面向养老、护理、社区服务及医养结合机构的多租户 SaaS 项目。

当前阶段已经进入模拟数据开发。首个业务场景为甘肃兰州养老服务机构的老人建档、合同归档、服务履约、影像留证和补贴核销材料管理。长护险及监管接口属于后续正式授权后的适配方向。

## 当前文档

- [项目长期记忆](./PROJECT_MEMORY.md)
- [立项说明书](./specs/medical-care-saas/requirements.md)
- [第一版功能边界](./specs/medical-care-saas/scope-v1.md)
- [首家试点虚拟默认业务模板](./specs/medical-care-saas/prototype-default-templates-v1.md)
- [第一版技术设计](./specs/medical-care-saas/design.md)
- [第一阶段实施任务](./specs/medical-care-saas/tasks.md)
- [真实空白服务表字段映射（已去机构化）](./specs/medical-care-saas/pilot-home-service-form-mapping-v1.md)

## 当前状态

- 产品名称尚未最终确定。
- 立项说明、第一版功能边界和技术设计已经确认。
- 已建立机构 Web、平台 Web、工作人员小程序、统一 API、共享契约、领域规则和 MySQL 数据模型。
- 已实现租户权限、临时支持授权和月度服务周期完整性规则的首批自动化测试。
- 仓库当前不包含真实老人数据、机构合同或服务影像。

## 工程目录

```text
apps/
  api/                  TypeScript 模块化单体 API
  organization-web/     机构管理后台
  platform-web/         平台运维后台
  staff-miniprogram/    工作人员微信小程序
packages/
  contracts/            请求、响应和字段校验契约
  database/             Prisma/MySQL 数据模型
  domain/               租户权限和业务完整性规则
```

## 本地启动

需要 Node.js 22 或以上版本，并使用仓库固定的 pnpm 版本。

```powershell
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm dev:web
```

API 的本地模拟身份只在 `NODE_ENV=development` 且 `AUTH_MODE=local-mock` 时有效；生产环境会拒绝这些开发请求头。CloudBase 登录供应商、MySQL、对象存储、短信和小程序 AppID 尚未配置，不要填写伪造密钥。

## 基本原则

- 多租户隔离和敏感数据保护优先。
- 合同原件、服务证据、无水印原始影像和宣传素材严格区分。
- 不在未获授权时宣称已接入医保或长护险生产系统。
- 项目资产同时保留自主创业、求职展示和授权转让三种用途。
