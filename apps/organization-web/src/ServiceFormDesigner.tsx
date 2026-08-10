import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CopyPlus,
  GripVertical,
  ImagePlus,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useMemo, useState, type DragEvent } from "react";
import type {
  OrganizationQualification,
  QualificationStatus,
  ServiceFormFieldType,
  ServiceFormWorkspace,
  ServiceTemplateField,
} from "./service-form-types";

type Props = {
  workspace: ServiceFormWorkspace;
  busy: boolean;
  onChange: (workspace: ServiceFormWorkspace) => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
};

type PresetFieldGroupDraft = {
  code: string;
  label: string;
  fields: ServiceTemplateField[];
};

const fieldTypeLabels: Record<ServiceFormFieldType, string> = {
  SHORT_TEXT: "单行文字",
  LONG_TEXT: "多行文字",
  NUMBER: "数字",
  SINGLE_CHOICE: "单选",
  MULTI_CHOICE: "多选",
  DATE: "日期",
  TIME: "时间",
  IMAGE: "图片",
  CUSTOMER_FEEDBACK: "客户反馈",
};

const qualificationStatusLabels: Partial<Record<QualificationStatus, string>> = {
  MISSING: "缺失",
  PENDING: "待审核",
  APPROVED: "已核验",
  EXPIRED: "已过期",
};

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clonePreset(field: ServiceTemplateField): ServiceTemplateField {
  return {
    ...field,
    id: uniqueId(field.presetCode?.toLowerCase() ?? "preset"),
    order: 0,
    options: field.options.map((item) => ({ ...item })),
    feedbackConfig: field.feedbackConfig ? { ...field.feedbackConfig } : undefined,
  };
}

function createCustomField(type: ServiceFormFieldType): ServiceTemplateField {
  const choice = type === "SINGLE_CHOICE" || type === "MULTI_CHOICE";
  return {
    id: uniqueId("custom-field"),
    source: "TENANT_CUSTOM",
    type,
    label: `自定义${fieldTypeLabels[type]}`,
    description: "",
    required: false,
    enabled: true,
    order: 0,
    options: choice
      ? [
          {
            id: uniqueId("custom-option"),
            label: "选项一",
            source: "TENANT_CUSTOM",
            enabled: true,
            order: 0,
          },
        ]
      : [],
    qualificationCodes: [],
  };
}

function FieldControlPreview({ field }: { field: ServiceTemplateField }) {
  if (field.type === "CUSTOMER_FEEDBACK") {
    const config = field.feedbackConfig;
    const labels = [
      ["satisfaction", "满意度"], ["tags", "评价标签"], ["text", "文字意见"],
      ["audio", "现场录音"], ["signature", "手写签名"], ["photo", "现场合照"],
      ["refusalReason", "拒绝或无法评价"],
    ] as const;
    return (
      <div className="feedback-preview">
        {labels.filter(([key]) => config?.[key] !== "DISABLED").map(([key, label]) => (
          <span key={key}>{label}{config?.[key] === "REQUIRED" ? " · 必填" : " · 选填"}</span>
        ))}
      </div>
    );
  }
  if (field.type === "SHORT_TEXT") {
    return (
      <input
        className="designer-control-preview"
        placeholder="请输入"
        readOnly
      />
    );
  }
  if (field.type === "LONG_TEXT") {
    return (
      <textarea
        className="designer-control-preview"
        placeholder="请输入"
        rows={2}
        readOnly
      />
    );
  }
  if (field.type === "NUMBER") {
    return (
      <div className="designer-number-preview">
        <input type="number" placeholder="请输入数值" readOnly />
        {field.unit ? <span>{field.unit}</span> : null}
      </div>
    );
  }
  if (field.type === "DATE") {
    return <input className="designer-control-preview" type="date" />;
  }
  if (field.type === "TIME") {
    return (
      <input
        className="designer-control-preview designer-time-preview"
        type="time"
        defaultValue="09:00"
        aria-label={`${field.label}时间选择预览`}
      />
    );
  }
  if (field.type === "SINGLE_CHOICE" || field.type === "MULTI_CHOICE") {
    return (
      <div className="designer-option-preview">
        {field.options
          .filter((option) => option.enabled)
          .slice(0, 8)
          .map((option) => (
            <label key={option.id}>
              <input
                type={field.type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                disabled
              />
              <span>{option.label}</span>
            </label>
          ))}
      </div>
    );
  }
  return (
    <div
      className="designer-image-preview"
      aria-label={`${field.label}上传入口预览`}
    >
      <ImagePlus size={24} />
      <strong>点击或拖入图片</strong>
      <span>员工端在这里选择现场图片</span>
    </div>
  );
}

export function ServiceFormDesigner({
  workspace,
  busy,
  onChange,
  onSave,
  onPublish,
}: Props) {
  const [selectedFieldId, setSelectedFieldId] = useState(
    workspace.draftTemplate.fields[0]?.id ?? "",
  );
  const [presetDraft, setPresetDraft] = useState<ServiceTemplateField | null>(
    null,
  );
  const [presetGroupDraft, setPresetGroupDraft] =
    useState<PresetFieldGroupDraft | null>(null);
  const [presetError, setPresetError] = useState("");
  const [gateField, setGateField] = useState<ServiceTemplateField | null>(null);
  const [qualificationPanelOpen, setQualificationPanelOpen] = useState(false);
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const draft = workspace.draftTemplate;
  const selectedField = draft.fields.find(
    (field) => field.id === selectedFieldId,
  );
  const presetLibrary = useMemo(() => {
    const groups = new Map<
      string,
      { code: string; label: string; fields: ServiceTemplateField[] }
    >();
    const standalone: ServiceTemplateField[] = [];
    workspace.presetFields.forEach((field) => {
      if (!field.groupCode || !field.groupLabel) {
        standalone.push(field);
        return;
      }
      const current = groups.get(field.groupCode) ?? {
        code: field.groupCode,
        label: field.groupLabel,
        fields: [],
      };
      current.fields.push(field);
      groups.set(field.groupCode, current);
    });
    return { groups: [...groups.values()], standalone };
  }, [workspace.presetFields]);
  const missingForGate = useMemo(
    () =>
      gateField?.qualificationCodes
        .map((code) =>
          workspace.qualifications.find((item) => item.code === code),
        )
        .filter((item): item is OrganizationQualification =>
          Boolean(item && item.status !== "APPROVED"),
        ) ?? [],
    [gateField, workspace.qualifications],
  );

  function setFields(fields: ServiceTemplateField[]) {
    onChange({
      ...workspace,
      draftTemplate: {
        ...draft,
        fields: fields.map((field, order) => ({ ...field, order })),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function addField(field: ServiceTemplateField) {
    const missingCodes = field.qualificationCodes.filter(
      (code) =>
        workspace.qualifications.find((item) => item.code === code)?.status !==
        "APPROVED",
    );
    if (missingCodes.length > 0) {
      setGateField(field);
      return;
    }
    const next = { ...field, order: draft.fields.length };
    setFields([...draft.fields, next]);
    setSelectedFieldId(next.id);
  }

  function openPreset(field: ServiceTemplateField) {
    if (
      field.presetCode &&
      draft.fields.some((item) => item.presetCode === field.presetCode)
    ) {
      setSelectedFieldId(
        draft.fields.find((item) => item.presetCode === field.presetCode)?.id ??
          "",
      );
      return;
    }
    setPresetError("");
    const preset = clonePreset(field);
    setPresetDraft({
      ...preset,
      options: preset.options.map((option) => ({
        ...option,
        enabled: false,
      })),
    });
  }

  function confirmPreset() {
    if (!presetDraft) return;
    const label = presetDraft.label.trim();
    const options = presetDraft.options
      .filter((item) => item.enabled && item.label.trim())
      .map((item, order) => ({ ...item, label: item.label.trim(), order }));
    if (!label) {
      setPresetError("请填写字段标题。");
      return;
    }
    if (
      (presetDraft.type === "SINGLE_CHOICE" ||
        presetDraft.type === "MULTI_CHOICE") &&
      options.length === 0
    ) {
      setPresetError("请至少选择或添加一个服务词条。");
      return;
    }
    addField({ ...presetDraft, label, options });
    setPresetDraft(null);
    setPresetError("");
  }

  function openPresetGroup(group: {
    code: string;
    label: string;
    fields: ServiceTemplateField[];
  }) {
    const existingCodes = new Set(
      draft.fields.map((field) => field.presetCode).filter(Boolean),
    );
    setPresetError("");
    setPresetGroupDraft({
      code: group.code,
      label: group.label,
      fields: group.fields
        .filter((field) => !existingCodes.has(field.presetCode))
        .map((field) => ({
          ...clonePreset(field),
          enabled: false,
        })),
    });
  }

  function confirmPresetGroup() {
    if (!presetGroupDraft) return;
    const selected = presetGroupDraft.fields.filter((field) => field.enabled);
    if (!presetGroupDraft.label.trim()) {
      setPresetError("请填写字段组名称。");
      return;
    }
    if (!selected.length) {
      setPresetError("请至少选择一个指标字段。");
      return;
    }
    const existingCodes = new Set(
      draft.fields.map((field) => field.presetCode).filter(Boolean),
    );
    const additions = selected
      .filter((field) => !existingCodes.has(field.presetCode))
      .map((field, index) => ({
        ...field,
        groupCode: presetGroupDraft.code,
        groupLabel: presetGroupDraft.label.trim(),
        order: draft.fields.length + index,
      }));
    if (!additions.length) {
      setPresetError("所选字段已经在当前表单中。");
      return;
    }
    setFields([...draft.fields, ...additions]);
    setSelectedFieldId(additions[0]?.id ?? "");
    setPresetGroupDraft(null);
    setPresetError("");
  }

  function addComponent(type: ServiceFormFieldType) {
    addField(createCustomField(type));
  }

  function updateSelected(patch: Partial<ServiceTemplateField>) {
    if (!selectedField) return;
    setFields(
      draft.fields.map((field) =>
        field.id === selectedField.id ? { ...field, ...patch } : field,
      ),
    );
  }

  function moveSelected(offset: -1 | 1) {
    if (!selectedField) return;
    const index = draft.fields.findIndex(
      (field) => field.id === selectedField.id,
    );
    const target = index + offset;
    if (target < 0 || target >= draft.fields.length) return;
    const fields = [...draft.fields];
    [fields[index], fields[target]] = [fields[target]!, fields[index]!];
    setFields(fields);
  }

  function removeSelected() {
    if (!selectedField) return;
    const fields = draft.fields.filter(
      (field) => field.id !== selectedField.id,
    );
    setFields(fields);
    setSelectedFieldId(fields[0]?.id ?? "");
  }

  function duplicateSelected() {
    if (!selectedField) return;
    const copy: ServiceTemplateField = {
      ...selectedField,
      id: uniqueId("field-copy"),
      presetCode: undefined,
      source: "TENANT_CUSTOM",
      label: `${selectedField.label}副本`,
      options: selectedField.options.map((option, order) => ({
        ...option,
        id: uniqueId("option-copy"),
        source: "TENANT_CUSTOM",
        order,
      })),
      order: selectedField.order + 1,
    };
    const fields = [...draft.fields];
    fields.splice(selectedField.order + 1, 0, copy);
    setFields(fields);
    setSelectedFieldId(copy.id);
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    kind: "preset" | "component",
    value: string,
  ) {
    event.dataTransfer.setData(
      "application/x-service-form-field",
      `${kind}:${value}`,
    );
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const payload = event.dataTransfer.getData(
      "application/x-service-form-field",
    );
    const [kind, value] = payload.split(":");
    if (kind === "preset") {
      const preset = workspace.presetFields.find(
        (field) => field.presetCode === value,
      );
      if (preset) openPreset(preset);
    }
    if (kind === "component" && value in fieldTypeLabels) {
      addComponent(value as ServiceFormFieldType);
    }
  }

  return (
    <div className="form-designer-shell">
      <header className="designer-toolbar">
        <div>
          <p className="eyebrow">{workspace.storeLabel}</p>
          <h1>服务表单设计器</h1>
          <span>
            草稿版本 {draft.version} · 当前发布版本{" "}
            {workspace.publishedTemplate.version}
          </span>
        </div>
        <div className="designer-actions">
          <button type="button" onClick={() => setQualificationPanelOpen(true)}>
            <BadgeCheck size={17} /> 机构资质
          </button>
          <button type="button" disabled={busy} onClick={() => void onSave()}>
            保存草稿
          </button>
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => setPublishConfirmationOpen(true)}
          >
            发布模板
          </button>
        </div>
      </header>

      <div className="designer-columns">
        <aside className="field-palette">
          <section>
            <h2>推荐字段库</h2>
            <div className="palette-list">
              {presetLibrary.groups.map((group) => {
                const addedCount = group.fields.filter((field) =>
                  draft.fields.some(
                    (item) => item.presetCode === field.presetCode,
                  ),
                ).length;
                return (
                  <button
                    type="button"
                    className={
                      addedCount === group.fields.length
                        ? "palette-item added"
                        : "palette-item"
                    }
                    key={group.code}
                    onClick={() => openPresetGroup(group)}
                  >
                    <CopyPlus size={16} />
                    <span>
                      <strong>{group.label}</strong>
                      <small>
                        {group.fields.length} 个推荐字段
                        {addedCount ? ` · 已加入 ${addedCount} 个` : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
              {presetLibrary.standalone.map((field) => {
                const added = draft.fields.some(
                  (item) => item.presetCode === field.presetCode,
                );
                return (
                  <button
                    type="button"
                    draggable
                    className={added ? "palette-item added" : "palette-item"}
                    key={field.id}
                    onDragStart={(event) =>
                      handleDragStart(
                        event,
                        "preset",
                        field.presetCode ?? field.id,
                      )
                    }
                    onClick={() => openPreset(field)}
                  >
                    <CopyPlus size={16} />
                    <span>
                      <strong>{field.label}</strong>
                      <small>
                        {field.options.length
                          ? `${field.options.length} 个推荐词条`
                          : fieldTypeLabels[field.type]}
                      </small>
                    </span>
                    {field.qualificationCodes.length > 0 ? (
                      <ShieldAlert size={14} aria-label="需要资质" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <h2>通用组件</h2>
            <div className="palette-list">
              {workspace.componentTypes.map((component) => (
                <button
                  type="button"
                  draggable
                  className="palette-item"
                  key={component.type}
                  title={component.description}
                  onDragStart={(event) =>
                    handleDragStart(event, "component", component.type)
                  }
                  onClick={() => addComponent(component.type)}
                >
                  <Plus size={16} />
                  <span>{component.label}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section
          className="form-canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <header>
            <div>
              <span>员工端表单预览</span>
              <h2>{draft.name}</h2>
            </div>
            <small>{draft.fields.length} 个业务字段</small>
          </header>
          <div className="system-facts-preview">
            服务对象　服务日期　开始/结束时间　负责人　参与人员
          </div>
          <div className="canvas-fields">
            {draft.fields.length === 0 ? (
              <div className="canvas-empty">从左侧拖入或点击添加字段</div>
            ) : (
              draft.fields.map((field, index) => (
                <Fragment key={field.id}>
                  {field.groupLabel &&
                  draft.fields[index - 1]?.groupCode !== field.groupCode ? (
                    <div className="canvas-field-group-title">
                      <strong>{field.groupLabel}</strong>
                      <span>同组字段统一展示</span>
                    </div>
                  ) : null}
                  <article
                    className={
                      field.id === selectedFieldId
                        ? "canvas-field selected"
                        : "canvas-field"
                    }
                  >
                    <button
                      className="canvas-field-heading"
                      type="button"
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <GripVertical size={18} />
                      <span>
                        <strong>{field.label}</strong>
                        <small>
                          {fieldTypeLabels[field.type]}
                          {field.required ? " · 必填" : " · 选填"}
                          {field.source === "PRESET" ? " · 预设" : " · 自定义"}
                          {` · ${field.evidenceStage === "BEFORE" ? "服务前" : field.evidenceStage === "AFTER" ? "服务后" : "服务中"}`}
                        </small>
                      </span>
                    </button>
                    {field.description ? (
                      <p className="canvas-field-description">
                        {field.description}
                      </p>
                    ) : null}
                    <FieldControlPreview field={field} />
                  </article>
                </Fragment>
              ))
            )}
          </div>
        </section>

        <aside className="property-editor">
          <h2>字段属性</h2>
          {selectedField ? (
            <>
              <label>
                <span>字段标题</span>
                <input
                  value={selectedField.label}
                  onChange={(event) =>
                    updateSelected({ label: event.target.value })
                  }
                />
              </label>
              {selectedField.groupCode ? (
                <label>
                  <span>所属字段组</span>
                  <input
                    value={selectedField.groupLabel ?? ""}
                    onChange={(event) =>
                      updateSelected({ groupLabel: event.target.value })
                    }
                  />
                </label>
              ) : null}
              <label>
                <span>填写说明</span>
                <textarea
                  rows={3}
                  value={selectedField.description}
                  onChange={(event) =>
                    updateSelected({ description: event.target.value })
                  }
                />
              </label>
              <label>
                <span>填写要求</span>
                <select
                  value={selectedField.required ? "REQUIRED" : "OPTIONAL"}
                  onChange={(event) =>
                    updateSelected({
                      required: event.target.value === "REQUIRED",
                    })
                  }
                >
                  <option value="OPTIONAL">选填</option>
                  <option value="REQUIRED">必填</option>
                </select>
              </label>
              <label>
                <span>适用阶段</span>
                <select
                  value={selectedField.evidenceStage || "DURING"}
                  onChange={(event) =>
                    updateSelected({
                      evidenceStage: event.target.value as
                        | "BEFORE"
                        | "DURING"
                        | "AFTER",
                    })
                  }
                >
                  <option value="BEFORE">服务前</option>
                  <option value="DURING">服务中</option>
                  <option value="AFTER">服务后</option>
                </select>
              </label>
              {selectedField.type === "TIME" ? (
                <div className="control-rule-note">
                  员工端显示时间选择器，范围为 00:00—23:59。
                </div>
              ) : null}
              {selectedField.type === "IMAGE" ? (
                <div className="control-rule-note">
                  员工端显示加号上传框；当前验证版支持单张图片。
                </div>
              ) : null}
              {selectedField.type === "CUSTOMER_FEEDBACK" && selectedField.feedbackConfig ? (
                <section className="feedback-config-editor">
                  <h3>反馈子项</h3>
                  {([
                    ["satisfaction", "满意度"], ["tags", "评价标签"], ["text", "文字意见"],
                    ["audio", "现场录音"], ["signature", "手写签名"], ["photo", "现场合照"],
                    ["refusalReason", "拒绝或无法评价"],
                  ] as const).map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <select value={selectedField.feedbackConfig?.[key] || "DISABLED"}
                        onChange={(event) => updateSelected({ feedbackConfig: {
                          ...selectedField.feedbackConfig!, [key]: event.target.value as "DISABLED" | "OPTIONAL" | "REQUIRED",
                        } })}>
                        <option value="DISABLED">停用</option>
                        <option value="OPTIONAL">选填</option>
                        <option value="REQUIRED">必填</option>
                      </select>
                    </label>
                  ))}
                  <label><span>录音最长秒数</span><input type="number" min="10" max="180" value={selectedField.feedbackConfig.maxAudioSeconds}
                    onChange={(event) => updateSelected({ feedbackConfig: { ...selectedField.feedbackConfig!, maxAudioSeconds: Math.max(10, Math.min(180, Number(event.target.value) || 60)) } })}/></label>
                  <label><span>合照最多张数</span><input type="number" min="1" max="6" value={selectedField.feedbackConfig.maxPhotos}
                    onChange={(event) => updateSelected({ feedbackConfig: { ...selectedField.feedbackConfig!, maxPhotos: Math.max(1, Math.min(6, Number(event.target.value) || 3)) } })}/></label>
                </section>
              ) : null}
              {selectedField.type === "NUMBER" ? (
                <label>
                  <span>单位</span>
                  <input
                    value={selectedField.unit ?? ""}
                    onChange={(event) =>
                      updateSelected({ unit: event.target.value })
                    }
                  />
                </label>
              ) : null}
              {selectedField.type === "SINGLE_CHOICE" ||
              selectedField.type === "MULTI_CHOICE" ? (
                <section className="option-editor">
                  <h3>选项</h3>
                  {selectedField.options.map((item, index) => (
                    <div key={item.id}>
                      <input
                        value={item.label}
                        onChange={(event) =>
                          updateSelected({
                            options: selectedField.options.map((option) =>
                              option.id === item.id
                                ? { ...option, label: event.target.value }
                                : option,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label={`删除选项 ${item.label}`}
                        onClick={() =>
                          updateSelected({
                            options: selectedField.options
                              .filter((option) => option.id !== item.id)
                              .map((option, order) => ({ ...option, order })),
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                      <small>{index + 1}</small>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateSelected({
                        options: [
                          ...selectedField.options,
                          {
                            id: uniqueId("custom-option"),
                            label: `新选项 ${selectedField.options.length + 1}`,
                            source: "TENANT_CUSTOM",
                            enabled: true,
                            order: selectedField.options.length,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} /> 新增选项
                  </button>
                </section>
              ) : null}
              {selectedField.qualificationCodes.length > 0 ? (
                <div className="qualification-summary">
                  <ShieldAlert size={17} />
                  <span>此预设字段受机构资质门禁控制</span>
                </div>
              ) : null}
              <div className="field-order-actions">
                <button type="button" onClick={() => moveSelected(-1)}>
                  <ArrowUp size={16} /> 上移
                </button>
                <button type="button" onClick={() => moveSelected(1)}>
                  <ArrowDown size={16} /> 下移
                </button>
                <button type="button" onClick={duplicateSelected}>
                  <CopyPlus size={16} /> 复制
                </button>
                <button
                  className="danger-action"
                  type="button"
                  onClick={removeSelected}
                >
                  <Trash2 size={16} /> 移除
                </button>
              </div>
            </>
          ) : (
            <p className="property-empty">在画布中选择一个字段后编辑。</p>
          )}
        </aside>
      </div>

      {presetGroupDraft ? (
        <div className="modal-backdrop">
          <section className="preset-picker" role="dialog" aria-modal="true">
            <header>
              <div>
                <p className="eyebrow">推荐字段组</p>
                <h2>选择需要启用的指标</h2>
              </div>
              <button
                type="button"
                aria-label="关闭字段组配置"
                onClick={() => setPresetGroupDraft(null)}
              >
                <X size={18} />
              </button>
            </header>
            <label>
              <span>字段组名称</span>
              <input
                value={presetGroupDraft.label}
                onChange={(event) =>
                  setPresetGroupDraft({
                    ...presetGroupDraft,
                    label: event.target.value,
                  })
                }
              />
            </label>
            <section className="preset-option-picker">
              <div className="preset-option-heading">
                <div>
                  <strong>推荐子字段</strong>
                  <span>启用需要的项目，并分别设置必填或选填。</span>
                </div>
              </div>
              {presetGroupDraft.fields.length ? (
                <div className="preset-field-group-list">
                  {presetGroupDraft.fields.map((field) => (
                    <div className="preset-field-row" key={field.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={field.enabled}
                          onChange={(event) =>
                            setPresetGroupDraft({
                              ...presetGroupDraft,
                              fields: presetGroupDraft.fields.map((item) =>
                                item.id === field.id
                                  ? { ...item, enabled: event.target.checked }
                                  : item,
                              ),
                            })
                          }
                        />
                        <input
                          value={field.label}
                          disabled={!field.enabled}
                          onChange={(event) =>
                            setPresetGroupDraft({
                              ...presetGroupDraft,
                              fields: presetGroupDraft.fields.map((item) =>
                                item.id === field.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                        <span>{field.unit}</span>
                      </label>
                      <label className="preset-child-required">
                        <input
                          type="checkbox"
                          checked={field.required}
                          disabled={!field.enabled}
                          onChange={(event) =>
                            setPresetGroupDraft({
                              ...presetGroupDraft,
                              fields: presetGroupDraft.fields.map((item) =>
                                item.id === field.id
                                  ? { ...item, required: event.target.checked }
                                  : item,
                              ),
                            })
                          }
                        />
                        必填
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="property-empty">该组的推荐字段已全部加入表单。</p>
              )}
            </section>
            {presetError ? <p className="form-error">{presetError}</p> : null}
            <footer>
              <button type="button" onClick={() => setPresetGroupDraft(null)}>
                取消
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={!presetGroupDraft.fields.length}
                onClick={confirmPresetGroup}
              >
                加入表单
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {presetDraft ? (
        <div className="modal-backdrop">
          <section className="preset-picker" role="dialog" aria-modal="true">
            <header>
              <div>
                <p className="eyebrow">推荐字段</p>
                <h2>配置后加入表单</h2>
              </div>
              <button
                type="button"
                aria-label="关闭推荐字段配置"
                onClick={() => setPresetDraft(null)}
              >
                <X size={18} />
              </button>
            </header>
            <label>
              <span>字段标题</span>
              <input
                value={presetDraft.label}
                onChange={(event) =>
                  setPresetDraft({ ...presetDraft, label: event.target.value })
                }
              />
            </label>
            <label className="preset-required">
              <input
                type="checkbox"
                checked={presetDraft.required}
                onChange={(event) =>
                  setPresetDraft({
                    ...presetDraft,
                    required: event.target.checked,
                  })
                }
              />
              <span>员工必须填写此字段</span>
            </label>
            {presetDraft.options.length ? (
              <section className="preset-option-picker">
                <div className="preset-option-heading">
                  <div>
                    <strong>推荐词条</strong>
                    <span>只把本门店需要的词条加入字段，名称可以修改。</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPresetDraft({
                        ...presetDraft,
                        options: [
                          ...presetDraft.options,
                          {
                            id: uniqueId("preset-custom-option"),
                            label: `自定义服务 ${presetDraft.options.length + 1}`,
                            source: "TENANT_CUSTOM",
                            enabled: true,
                            order: presetDraft.options.length,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} /> 新增词条
                  </button>
                </div>
                <div className="preset-option-list">
                  {presetDraft.options.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) =>
                          setPresetDraft({
                            ...presetDraft,
                            options: presetDraft.options.map((option) =>
                              option.id === item.id
                                ? { ...option, enabled: event.target.checked }
                                : option,
                            ),
                          })
                        }
                      />
                      <input
                        value={item.label}
                        disabled={!item.enabled}
                        onChange={(event) =>
                          setPresetDraft({
                            ...presetDraft,
                            options: presetDraft.options.map((option) =>
                              option.id === item.id
                                ? { ...option, label: event.target.value }
                                : option,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
            {presetError ? <p className="form-error">{presetError}</p> : null}
            <footer>
              <button type="button" onClick={() => setPresetDraft(null)}>
                取消
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={confirmPreset}
              >
                加入表单
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {gateField ? (
        <div className="modal-backdrop">
          <section
            className="qualification-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <p className="eyebrow">受限预设字段</p>
                <h2>添加“{gateField.label}”需要机构资质</h2>
              </div>
              <button
                aria-label="关闭资质提示"
                onClick={() => setGateField(null)}
              >
                <X size={18} />
              </button>
            </header>
            {missingForGate.map((item) => (
              <article key={item.code}>
                <strong>{item.name}</strong>
                <span>{qualificationStatusLabels[item.status]}</span>
              </article>
            ))}
            <footer>
              <button
                type="button"
                onClick={() => {
                  setGateField(null);
                  setQualificationPanelOpen(true);
                }}
              >
                查看机构资质
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {qualificationPanelOpen ? (
        <div className="modal-backdrop">
          <section
            className="qualification-modal wide"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <h2>机构资质状态</h2>
              </div>
              <button
                aria-label="关闭机构资质"
                onClick={() => setQualificationPanelOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            {workspace.qualifications.map((item) => (
              <article className="qualification-row" key={item.code}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.mockDocumentName}</small>
                </div>
                <mark data-tone={item.status}>
                  {qualificationStatusLabels[item.status] || "已退回"}
                </mark>
              </article>
            ))}
          </section>
        </div>
      ) : null}

      {publishConfirmationOpen ? (
        <div className="modal-backdrop">
          <section className="preset-picker publish-confirmation" role="dialog" aria-modal="true">
            <header>
              <div>
                <p className="eyebrow">发布新版本</p>
                <h2>确认员工端表单内容</h2>
              </div>
              <button type="button" aria-label="关闭发布确认" onClick={() => setPublishConfirmationOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="publish-summary">
              <p>发布后，新建任务使用第 {draft.version + 1} 版；历史任务继续使用原版本。</p>
              <dl>
                <div><dt>字段总数</dt><dd>{draft.fields.length}</dd></div>
                <div><dt>必填字段</dt><dd>{draft.fields.filter((field) => field.required).length}</dd></div>
                <div><dt>字段组</dt><dd>{new Set(draft.fields.map((field) => field.groupCode).filter(Boolean)).size}</dd></div>
                <div><dt>资质受限字段</dt><dd>{draft.fields.filter((field) => field.qualificationCodes.length).length}</dd></div>
              </dl>
            </div>
            <footer>
              <button type="button" onClick={() => setPublishConfirmationOpen(false)}>继续编辑</button>
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={async () => {
                  await onPublish();
                  setPublishConfirmationOpen(false);
                }}
              >
                确认发布
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
