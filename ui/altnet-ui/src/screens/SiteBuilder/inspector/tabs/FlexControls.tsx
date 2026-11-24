import Field from "../../ui/Field";
import { flexChoices, resolveFlexLayout, type FlexSettings, type LayoutBreakpoint } from "../../layoutResponsive";
import type { ContainerBlock, SectionBlock } from "../../types";
import type { BlockPatch } from "../patch";

const labels = {
  row: "Строка →",
  "row-reverse": "Строка ←",
  column: "Столбец ↓",
  "column-reverse": "Столбец ↑",
  "flex-start": "В начале",
  center: "По центру",
  "flex-end": "В конце",
  "space-between": "Между элементами",
  "space-around": "Вокруг элементов",
  "space-evenly": "Равномерно",
  stretch: "Растянуть",
  baseline: "По базовой линии",
  nowrap: "Одна линия",
  wrap: "Переносить",
  "wrap-reverse": "Обратный перенос",
  ratio: "По пропорциям",
  content: "По содержимому",
  fixed: "Заданная ширина",
  boxed: "Ограниченная",
  full: "На всю ширину",
};
const input = "w-full rounded border px-2 py-1";
type Props = { block: SectionBlock | ContainerBlock; device: LayoutBreakpoint; onPatch: (patch: BlockPatch) => void };

export default function FlexControls({ block, device, onPatch }: Props) {
  const own = block.flexByBp?.[device] ?? {};
  const { row, contentWidth, basis, sizing } = resolveFlexLayout(block, device);
  function update(key: keyof FlexSettings, value: string | number | undefined) {
    onPatch((current) => {
      if (current.type !== "section" && current.type !== "container") return {};
      const layers = { ...current.flexByBp };
      const next = { ...layers[device] };
      if (value === undefined) delete next[key];
      else Object.assign(next, { [key]: value });
      if (Object.keys(next).length) layers[device] = next;
      else delete layers[device];
      return { flexByBp: layers };
    });
  }
  function choice(key: keyof typeof flexChoices, title: string) {
    return (
      <Field label={title}>
        <select className={input} value={own[key] ?? ""} onChange={(e) => update(key, e.target.value || undefined)}>
          <option value="">Авто / наследовать</option>
          {flexChoices[key].map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  function length(key: "basis" | "minHeight" | "maxWidth", title: string, hint: number, min: number, max: number) {
    return (
      <Field label={title}>
        <input
          className={input}
          type="number"
          min={min}
          max={max}
          value={own[key] ?? ""}
          placeholder={String(hint)}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (e.target.value === "") update(key, undefined);
            else if (Number.isFinite(n)) update(key, Math.max(min, Math.min(max, n)));
          }}
        />
      </Field>
    );
  }
  return (
    <fieldset className="grid gap-2 rounded border p-2">
      <legend className="px-1 text-xs">Flexbox</legend>
      {choice("direction", "Направление элементов")}
      {choice("justify", "Вдоль основной оси")}
      {choice("align", "Поперёк основной оси")}
      {choice("wrap", "Перенос элементов")}
      {row.flexWrap !== "nowrap" && choice("alignContent", "Выравнивание строк")}
      {choice("sizing", "Размер ячеек")}
      {(sizing === "fixed" ||
        (sizing === "ratio" && row.flexWrap !== "nowrap" && row.flexDirection.startsWith("row"))) &&
        length("basis", "Базовый размер ячейки, px", basis, 1, 3840)}
      {choice("contentWidth", "Ширина содержимого")}
      {contentWidth === "boxed" &&
        length("maxWidth", "Максимальная ширина содержимого, px", parseFloat(row.maxWidth), 1, 3840)}
      {length("minHeight", "Минимальная высота макета, px", parseFloat(row.minHeight), 0, 2400)}
    </fieldset>
  );
}
