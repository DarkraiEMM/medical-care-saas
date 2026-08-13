import { ImagePlus } from "lucide-react";
import { useState } from "react";
import type { ServiceTemplateField } from "./service-form-types";

const demoImages = {
  BEFORE: "/demo-evidence/ai-demo-before.png",
  DURING: "/demo-evidence/ai-demo-during.png",
  AFTER: "/demo-evidence/ai-demo-after.png",
} as const;

function ImageFieldControl({ field }: { field: ServiceTemplateField }) {
  const [fileName, setFileName] = useState("");
  return (
    <div className="dynamic-image-field">
      {field.evidenceStage ? (
        <figure>
          <img
            src={demoImages[field.evidenceStage]}
            alt={`${field.label}演示图片`}
          />
          <label>
            <input type="checkbox" name={`demo:${field.id}`} />
            <span>使用演示图片</span>
          </label>
        </figure>
      ) : null}
      <label className="image-upload-tile">
        <input
          type="file"
          name={`image:${field.id}`}
          accept="image/*"
          onChange={(event) =>
            setFileName(event.currentTarget.files?.[0]?.name ?? "")
          }
        />
        <ImagePlus size={25} />
        <strong>{fileName || "添加图片"}</strong>
        <span>{fileName ? "点击可重新选择" : "点击打开图片选择器"}</span>
      </label>
    </div>
  );
}

export function DynamicServiceFields({
  fields,
}: {
  fields: ServiceTemplateField[];
}) {
  return (
    <div className="dynamic-service-fields">
      {fields
        .filter((field) => field.enabled)
        .sort((left, right) => left.order - right.order)
        .map((field) => (
          <section className="dynamic-field" key={field.id}>
            <header>
              <strong>{field.label}</strong>
              <span>{field.required ? "必填" : "选填"}</span>
            </header>
            {field.description ? <p>{field.description}</p> : null}
            {field.type === "SHORT_TEXT" ? (
              <input name={`answer:${field.id}`} type="text" />
            ) : null}
            {field.type === "LONG_TEXT" ? (
              <textarea name={`answer:${field.id}`} rows={3} />
            ) : null}
            {field.type === "NUMBER" ? (
              <label className="number-with-unit">
                <input name={`answer:${field.id}`} type="number" step="any" />
                {field.unit ? <span>{field.unit}</span> : null}
              </label>
            ) : null}
            {field.type === "DATE" ? (
              <input name={`answer:${field.id}`} type="date" />
            ) : null}
            {field.type === "TIME" ? (
              <input name={`answer:${field.id}`} type="time" />
            ) : null}
            {field.type === "SINGLE_CHOICE" ? (
              <div className="dynamic-options">
                {field.options
                  .filter((option) => option.enabled)
                  .sort((left, right) => left.order - right.order)
                  .map((option) => (
                    <label key={option.id}>
                      <input
                        type="radio"
                        name={`answer:${field.id}`}
                        value={option.id}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
              </div>
            ) : null}
            {field.type === "MULTI_CHOICE" ? (
              <div className="dynamic-options">
                {field.options
                  .filter((option) => option.enabled)
                  .sort((left, right) => left.order - right.order)
                  .map((option) => (
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        name={`answer:${field.id}`}
                        value={option.id}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
              </div>
            ) : null}
            {field.type === "IMAGE" ? (
              <ImageFieldControl field={field} />
            ) : null}
          </section>
        ))}
    </div>
  );
}
