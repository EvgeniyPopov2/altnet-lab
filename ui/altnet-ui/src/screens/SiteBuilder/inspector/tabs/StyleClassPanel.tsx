import { useContext, useState } from "react";
import { StyleClassesContext } from "../../styleClassesContext";
import { promoteStyle, removeStyleClass, reorderStyleClass, validClassName } from "../../styleClasses";
import { newId } from "../../registry";
import type { Block, Device, DeviceStyles, StyleClass } from "../../types";
import type { BlockPatch } from "../patch";
import StyleTab from "./StyleTab";
import TransformControls from "./TransformControls";
import LayoutEffects from "./LayoutEffects";
import BlockFilterControls from "./BlockFilterControls";
import EntranceControls from "./EntranceControls";

function representative(rule: StyleClass): Block {
  return { type: "heading", id: rule.id, level: "h2", text: "", styleByBp: rule.layers };
}

export default function StyleClassPanel({
  block,
  onPatch,
  device,
}: {
  block: Block;
  onPatch: (p: BlockPatch) => void;
  device: Device;
}) {
  const { rules, edit } = useContext(StyleClassesContext);
  const [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [renaming, setRenaming] = useState("");
  const rule = rules.find((item) => item.id === selected),
    index = rules.findIndex((item) => item.id === selected);
  const nameAvailable = (value: string) => validClassName(value) && !rules.some((item) => item.name === value);
  function select(id: string) {
    setSelected(id);
    setRenaming(rules.find((item) => item.id === id)?.name ?? "");
  }
  function patchRule(patch: BlockPatch) {
    edit((doc) => ({
      ...doc,
      styleClasses: doc.styleClasses?.map((item) => {
        if (item.id !== selected) return item;
        const change = typeof patch === "function" ? patch(representative(item)) : patch;
        return change.styleByBp ? { ...item, layers: change.styleByBp as DeviceStyles } : item;
      }),
    }));
  }
  return (
    <details className="sb-template-panel sb-style-classes">
      <summary>Общие классы сайта</summary>
      <fieldset>
        <legend>Классы этого блока</legend>
        {rules.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={block.styleClassIds?.includes(item.id) ?? false}
              onChange={(e) => {
                const checked = e.target.checked;
                onPatch((current) => ({
                  styleClassIds: checked
                    ? [...new Set([...(current.styleClassIds ?? []), item.id])]
                    : (current.styleClassIds ?? []).filter((id) => id !== item.id),
                }));
              }}
            />
            {item.name}
          </label>
        ))}
        <label>
          Имя нового класса
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="article-title" maxLength={64} />
        </label>
        <button
          type="button"
          disabled={!nameAvailable(name)}
          onClick={() => {
            const id = newId("class");
            edit((doc) => promoteStyle(doc, block.id, name, id));
            setSelected(id);
            setRenaming(name);
            setName("");
          }}
        >
          Перенести оформление блока в класс
        </button>
      </fieldset>
      {rules.length > 0 && (
        <label>
          Редактировать общий класс
          <select value={rule?.id ?? ""} onChange={(e) => select(e.target.value)}>
            <option value="">Выберите класс</option>
            {rules.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {rule && (
        <fieldset className="sb-class-editor">
          <legend>{rule.name}</legend>
          <label>
            Название класса
            <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={64} />
          </label>
          <button
            type="button"
            disabled={!nameAvailable(renaming)}
            onClick={() =>
              edit((doc) => ({
                ...doc,
                styleClasses: doc.styleClasses?.map((item) =>
                  item.id === rule.id ? { ...item, name: renaming } : item
                ),
              }))
            }
          >
            Переименовать
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => edit((doc) => reorderStyleClass(doc, rule.id, -1))}
            >
              Ниже приоритет
            </button>
            <button
              type="button"
              disabled={index + 1 >= rules.length}
              onClick={() => edit((doc) => reorderStyleClass(doc, rule.id, 1))}
            >
              Выше приоритет
            </button>
          </div>
          <StyleTab key={rule.id} block={representative(rule)} device={device} onPatch={patchRule} />
          <TransformControls block={representative(rule)} device={device} onPatch={patchRule} />
          <LayoutEffects block={representative(rule)} device={device} onPatch={patchRule} />
          <BlockFilterControls block={representative(rule)} device={device} onPatch={patchRule} />
          <EntranceControls block={representative(rule)} device={device} onPatch={patchRule} previewBlockId={block.id} />
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Удалить класс «" + rule.name + "» со всех страниц проекта?")) {
                edit((doc) => removeStyleClass(doc, rule.id));
                setSelected("");
              }
            }}
          >
            Удалить класс со всего сайта
          </button>
        </fieldset>
      )}
    </details>
  );
}
