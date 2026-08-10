# 平台机构治理第一版设计

## 权限边界

机构端是材料提交方，只能上传、提交及查看；平台端是审核方，可审核机构元数据与资质材料元数据。服务表单和服务项目只读取最终审核状态，不能自行修改资质。

## 数据结构

### 机构档案

在租户表中补充：内部档案号、机构类型、统一社会信用代码、法定代表人、联系人、联系电话、省市区、详细地址、接入阶段、服务范围和备注。

### 机构资质

资质记录包含：机构、资质编码、名称、测试文件名、上传状态、审核状态、有效期、退回原因、提交时间、审核时间及审核人。当前演示文件只保存文件名和测试标识。

### 服务权限

专业服务与资质编码保持稳定关联：

- 健康服务 -> `HEALTH_SERVICE_OPERATION`
- 康复服务 -> `REHABILITATION_SERVICE`
- 专业护理 -> `PROFESSIONAL_NURSING`

表单发布和服务项目启用均以后端审核状态为准。

## 接口

- `GET /organization/qualifications`
- `POST /organization/qualifications/:code/upload`
- `POST /organization/qualifications/:code/submit`
- `GET /platform/qualifications`
- `POST /platform/qualifications/:tenantId/:code/review`
- 扩展 `GET/POST /platform/tenants` 与机构配置接口承载机构档案字段。

## 状态

资质：`NOT_UPLOADED -> UPLOADED -> PENDING -> APPROVED/REJECTED -> PENDING`。过期状态由有效期派生。系统能力：`HEALTHY | PLANNED | CONFIG_REQUIRED | MAINTENANCE | ERROR`。

## 界面

- 机构端资质页：材料、上传状态、审核状态、有效期、退回原因和操作按钮。
- 平台端增加“机构资质”页面；机构抽屉拆分“机构档案”和“运行与订阅”。
- 系统状态按“本地基础能力”和“外部能力接入计划”分组。

