import { useClassStyle } from "../../styleClassesContext";
import { blendModes } from "../../textAppearance";
import SpacingControl from "./SpacingControl";
import CornerControl from "./CornerControl";
import { corners } from "../../corners";
import type { Block, StyleLayer } from "../../types";
import { useRef, useState } from "react";
import Field from "../../ui/Field";
import { resolveResponsiveStyle } from "../../responsiveStyle";
import { buttonStyle } from "../../buttonStyle";
import { buttonIconPath } from "../../buttonIcons";
import type { BlockPatch } from "../patch";

type Device = "desktop" | "tablet" | "mobile";
type Props = { block: Block; onPatch: (patch: BlockPatch, group?: string) => void; device: Device };
const input = "w-full px-3 py-2 rounded-lg bg-[#0c0f1a] border border-[#1f2751]";
let gesture = 0;

function SliderField({ label, value, inherited, min, max, step = 1, fallback = 0, onChange }: {
  label: string; value: unknown; inherited: unknown; min: number; max: number; step?: number; fallback?: number;
  onChange: (value: string, group?: string) => void;
}) {
  const group = useRef<string | undefined>(undefined);
  const start = () => { if (!group.current) group.current = `slider-${++gesture}`; };
  const end = () => { group.current = undefined; };
  const resolved = typeof inherited === "number" && Number.isFinite(inherited) ? inherited : fallback;
  return <div className="sb-slider">
    <Field label={label}><input className={input} type="number" min={min} max={max} step={step}
      value={typeof value === "number" ? value : ""} onChange={e => onChange(e.target.value)} placeholder="—" /></Field>
      <input className="w-full accent-[#8b78ff]" type="range" aria-label={`${label} — ползунок`}
        min={min} max={max} step={step} value={Math.max(min, Math.min(max, resolved))}
        onPointerDown={start} onPointerUp={end} onPointerCancel={end} onKeyDown={start} onKeyUp={end} onBlur={end}
        onChange={e => onChange(e.target.value, group.current)} />
      <button type="button" className="text-xs text-[#c9d0e9] disabled:opacity-40"
        aria-label={`Сбросить: ${label}`} disabled={value === undefined} onClick={() => onChange("")}>↺</button>
  </div>;
}

export default function StyleTab({ block, onPatch, device }: Props) {
  const [buttonState, setButtonState] = useState<"normal" | "hover" | "active">("normal");
  const [imageState, setImageState] = useState<"normal" | "hover">("normal");
  const [linkPadding, setLinkPadding] = useState(false);
  const current = block.styleByBp?.[device] || {};
  const resolved = useClassStyle(block, device);
  const imageLayers = block.type === "img" ? block.imageStyleByBp : undefined;
  const image: StyleLayer = imageLayers?.[device] || {};
  const imageResolved = resolveResponsiveStyle({}, imageLayers, device);
  const buttonLayers = block.type === "btn" ? block.buttonStyleByBp : undefined;
  const button: StyleLayer = buttonLayers?.[device] || {};
  const buttonResolved = resolveResponsiveStyle({}, buttonLayers, device);
  const update = (collection: "styleByBp" | "buttonStyleByBp" | "imageStyleByBp", key: string, value: string, min?: number, max?: number, group?: string) => {
    let parsed: string | number | undefined = value;
    if (value === "") parsed = undefined;
    else if (min !== undefined && max !== undefined) {
      const n = Number(value); if (!Number.isFinite(n)) return;
      parsed = Math.max(min, Math.min(max, n));
    }
    onPatch((latest) => {
      const all = collection === "styleByBp" ? latest.styleByBp || {} : collection === "buttonStyleByBp" && latest.type === "btn" ? latest.buttonStyleByBp || {} : collection === "imageStyleByBp" && latest.type === "img" ? latest.imageStyleByBp || {} : {};
      const next: StyleLayer = { ...all[device] };
      if ((key === "radius" || key === "hoverRadius" || key === "activeRadius") && parsed !== undefined) {
        for (const [corner] of corners) delete next[key + corner];
      }
      if (parsed === undefined) delete next[key]; else next[key] = parsed;
      return { [collection]: { ...all, [device]: next } };
    }, group);
  };
  const slider = (collection: "styleByBp" | "buttonStyleByBp" | "imageStyleByBp", key: string, label: string, min: number, max: number, fallback = 0, step = 1) => {
    const values = collection === "styleByBp" ? current : collection === "imageStyleByBp" ? image : button;
    const inherited = collection === "styleByBp" ? resolved : collection === "imageStyleByBp" ? imageResolved : buttonResolved;
    return <SliderField key={key} label={label} value={values[key]} inherited={inherited[key]} min={min} max={max} fallback={fallback} step={step}
      onChange={(value, group) => update(collection, key, value, min, max, group)} />;
  };
  const change = (key: string, value: string) => key === "fw" ? update("styleByBp", key, value, 100, 900) : update("styleByBp", key, value);
  const buttonKey = (key: string) => buttonState === "normal" ? key : `${buttonState}${key[0].toUpperCase()}${key.slice(1)}`;
  const stateLabel = (normal: string, hover: string, active: string) => buttonState === "normal" ? normal : buttonState === "hover" ? hover : active;
  const sideSlider = (side: "Top" | "Right" | "Bottom" | "Left", label: string) => {
    const key = buttonKey(`padding${side}`), styles = buttonStyle(buttonLayers, device)[buttonState];
    const cssSide = `padding-${side.toLowerCase()}`, axis = side === "Top" || side === "Bottom" ? "padding-block" : "padding-inline";
    const inherited = parseFloat(styles[cssSide] ?? styles[axis] ?? (side === "Top" || side === "Bottom" ? "12" : "18"));
    return <SliderField key={key} label={label} value={button[key]} inherited={inherited} min={0} max={256} fallback={inherited}
      onChange={(value, group) => {
        if (!linkPadding) return update("buttonStyleByBp", key, value, 0, 256, group);
        const parsed = value === "" ? undefined : Number(value);
        if (parsed !== undefined && !Number.isFinite(parsed)) return;
        onPatch((latest) => {
          if (latest.type !== "btn") return {};
          const all = latest.buttonStyleByBp || {}, next: StyleLayer = { ...all[device] };
          for (const name of ["Top", "Right", "Bottom", "Left"]) {
            const property = buttonKey(`padding${name}`);
            if (parsed === undefined) delete next[property]; else next[property] = Math.max(0, Math.min(256, parsed));
          }
          return { buttonStyleByBp: { ...all, [device]: next } };
        }, group);
      }} />;
  };
  const buttonColor = (key: string, label: string, fallback: string) => {
    const name = buttonKey(key), raw = button[name] ?? "", inherited = buttonResolved[name];
    const hex = typeof inherited === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(inherited) ? inherited.slice(1) : "";
    const picker = hex.length === 3 || hex.length === 4 ? `#${hex.slice(0, 3).split("").map(char => char + char).join("")}` : hex ? `#${hex.slice(0, 6)}` : fallback;
    return <div key={name} className="sb-color-control">
      <Field label={label}><input className={input} value={raw} onChange={e => update("buttonStyleByBp", name, e.target.value)} placeholder="Наследовать" /></Field>
      <input type="color" aria-label={`Выбрать: ${label}`} value={picker} onChange={e => update("buttonStyleByBp", name, e.target.value)} />
      {raw && !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(raw)) && <p className="text-xs text-amber-300">Введите цвет в формате HEX.</p>}
    </div>;
  };
  function styleChoice(key: string, label: string, options: readonly (readonly string[])[]) {
    return <Field label={label}><select className={input} value={current[key] ?? ""} onChange={event => change(key, event.target.value)}>
      <option value="">Наследовать</option>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
    </select></Field>;
  }
  function styleColor(key: string, label: string, fallback = "#000000") {
    const value = String(current[key] ?? "");
    const inherited = String(resolved[key] ?? fallback);
    const pickerColor = (raw: string) => {
      if (/^#[a-f0-9]{3,4}$/i.test(raw)) return "#" + raw.slice(1, 4).split("").map(char => char + char).join("");
      if (/^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(raw)) return raw.slice(0, 7);
      return undefined;
    };
    const pickerValue = pickerColor(value) ?? pickerColor(inherited) ?? fallback;
    return <div className="sb-color-control"><Field label={label}><input className={input} value={value} placeholder="Наследовать" onChange={e => change(key, e.target.value)} /></Field>
      <input type="color" aria-label={`Выбрать: ${label}`} value={pickerValue} onChange={e => change(key, e.target.value)} />
    </div>;
  }
  return <div className="grid gap-3">
    <p className="text-xs text-[#c9d0e9]">Настройки для {device}. Пустое поле наследует значение предыдущего размера экрана; ↺ возвращает наследование.</p>
    {block.type === "btn" && <>
      <div className="text-sm font-semibold">Кнопка</div>
      <div role="group" aria-label="Состояние кнопки" className="grid grid-cols-3 gap-2">
        {([["normal", "Обычное"], ["hover", "Наведение"], ["active", "Нажатие"]] as const).map(([state, label]) =>
          <button key={state} type="button" aria-pressed={buttonState === state} onClick={() => setButtonState(state)}
            className={`rounded border px-2 py-1.5 text-xs ${buttonState === state ? "border-[#8b78ff] bg-[#29214d] text-white" : "border-[#393e59] text-[#c9d0e9]"}`}>{label}</button>)}
      </div>
      {buttonState === "hover" && <p className="text-xs text-[#c9d0e9]">Чтобы увидеть состояние, наведите курсор на кнопку или выберите её клавишей Tab.</p>}
      {buttonState === "active" && <p className="text-xs text-[#c9d0e9]">Чтобы увидеть состояние, нажмите и удерживайте кнопку на холсте.</p>}
      {buttonColor("color", stateLabel("Цвет текста кнопки (HEX)", "Цвет текста при наведении (HEX)", "Цвет текста при нажатии (HEX)"), "#ffffff")}
      {buttonColor("bg", stateLabel("Фон кнопки (HEX)", "Фон при наведении (HEX)", "Фон при нажатии (HEX)"), "#5865f2")}
      {buttonColor("borderColor", stateLabel("Цвет рамки кнопки (HEX)", "Цвет рамки при наведении (HEX)", "Цвет рамки при нажатии (HEX)"), "#5865f2")}
      <details className="rounded-lg border border-[#393e59] px-2 py-2">
        <summary className="cursor-pointer text-xs">Градиент и тень</summary>
        <div className="mt-3 grid gap-3">
          <Field label={stateLabel("Тип фона кнопки", "Тип фона при наведении", "Тип фона при нажатии")}><select className={input} value={button[buttonKey("backgroundType")] ?? ""} onChange={event => {
            const value = event.target.value, typeKey = buttonKey("backgroundType");
            onPatch((latest) => {
              if (latest.type !== "btn") return {};
          const all = latest.buttonStyleByBp || {}, next: StyleLayer = { ...all[device] };
              if (!value) delete next[typeKey]; else next[typeKey] = value;
              if (value === "gradient") {
                const effective = resolveResponsiveStyle({}, all, device);
                for (const [name, initial] of [["gradientStart", "#5865f2"], ["gradientEnd", "#a78bfa"], ["gradientAngle", 135]] as const) {
                  const field = buttonKey(name);
                  if (effective[field] === undefined) next[field] = initial;
                }
              }
              return { buttonStyleByBp: { ...all, [device]: next } };
            });
          }}><option value="">Наследовать</option><option value="solid">Сплошной</option><option value="gradient">Градиент</option></select></Field>
          {buttonResolved[buttonKey("backgroundType")] === "gradient" && <>
            {buttonColor("gradientStart", stateLabel("Первый цвет градиента (HEX)", "Первый цвет градиента при наведении (HEX)", "Первый цвет градиента при нажатии (HEX)"), "#5865f2")}
            {buttonColor("gradientEnd", stateLabel("Второй цвет градиента (HEX)", "Второй цвет градиента при наведении (HEX)", "Второй цвет градиента при нажатии (HEX)"), "#a78bfa")}
            {slider("buttonStyleByBp", buttonKey("gradientAngle"), stateLabel("Угол градиента, °", "Угол градиента при наведении, °", "Угол градиента при нажатии, °"), 0, 360, 135)}
          </>}
          <Field label={stateLabel("Тень кнопки", "Тень при наведении", "Тень при нажатии")}><select className={input} value={button[buttonKey("shadowMode")] ?? ""} onChange={event => update("buttonStyleByBp", buttonKey("shadowMode"), event.target.value)}>
            <option value="">Наследовать</option><option value="on">Настроить</option><option value="off">Без тени</option>
          </select></Field>
          {buttonResolved[buttonKey("shadowMode")] === "on" && <>
            {buttonColor("shadowColor", stateLabel("Цвет тени (HEX)", "Цвет тени при наведении (HEX)", "Цвет тени при нажатии (HEX)"), "#000000")}
            {slider("buttonStyleByBp", buttonKey("shadowX"), stateLabel("Смещение тени по горизонтали, px", "Смещение тени по горизонтали при наведении, px", "Смещение тени по горизонтали при нажатии, px"), -128, 128)}
            {slider("buttonStyleByBp", buttonKey("shadowY"), stateLabel("Смещение тени по вертикали, px", "Смещение тени по вертикали при наведении, px", "Смещение тени по вертикали при нажатии, px"), -128, 128, 4)}
            {slider("buttonStyleByBp", buttonKey("shadowBlur"), stateLabel("Размытие тени, px", "Размытие тени при наведении, px", "Размытие тени при нажатии, px"), 0, 128, 12)}
            {slider("buttonStyleByBp", buttonKey("shadowSpread"), stateLabel("Расширение тени, px", "Расширение тени при наведении, px", "Расширение тени при нажатии, px"), -128, 128)}
          </>}
        </div>
      </details>
      <Field label="Тип рамки кнопки"><select className={input} value={button[buttonKey("borderType")] ?? ""} onChange={e => update("buttonStyleByBp", buttonKey("borderType"), e.target.value)}>
        <option value="">Наследовать</option>{[["none","Без рамки"],["solid","Сплошная"],["double","Двойная"],["dotted","Точечная"],["dashed","Штриховая"],["groove","Объёмная"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></Field>
      <CornerControl key={block.id + device + buttonState} block={block} device={device} state={buttonState} onPatch={onPatch} />
      {slider("buttonStyleByBp", buttonKey("borderWidth"), stateLabel("Рамка кнопки, px", "Рамка при наведении, px", "Рамка при нажатии, px"), 0, 32, 1)}
      {slider("buttonStyleByBp", buttonKey("radius"), stateLabel("Скругление кнопки, px", "Скругление при наведении, px", "Скругление при нажатии, px"), 0, 256, 8)}
      {slider("buttonStyleByBp", buttonKey("paddingX"), stateLabel("Отступ кнопки по горизонтали, px", "Горизонтальный отступ при наведении, px", "Горизонтальный отступ при нажатии, px"), 0, 256, 16)}
      {slider("buttonStyleByBp", buttonKey("paddingY"), stateLabel("Отступ кнопки по вертикали, px", "Вертикальный отступ при наведении, px", "Вертикальный отступ при нажатии, px"), 0, 256, 8)}
      <details className="rounded-lg border border-[#393e59] px-2 py-2">
        <summary className="cursor-pointer text-xs">Отступы по сторонам</summary>
        <div className="mt-3 grid gap-3">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={linkPadding} onChange={event => setLinkPadding(event.target.checked)} />Связать отступы по сторонам</label>
          <p className="text-xs text-[#c9d0e9]">При связи изменение одной стороны задаёт одинаковое значение всем четырём.</p>
          {sideSlider("Top", stateLabel("Отступ кнопки сверху, px", "Отступ сверху при наведении, px", "Отступ сверху при нажатии, px"))}
          {sideSlider("Right", stateLabel("Отступ кнопки справа, px", "Отступ справа при наведении, px", "Отступ справа при нажатии, px"))}
          {sideSlider("Bottom", stateLabel("Отступ кнопки снизу, px", "Отступ снизу при наведении, px", "Отступ снизу при нажатии, px"))}
          {sideSlider("Left", stateLabel("Отступ кнопки слева, px", "Отступ слева при наведении, px", "Отступ слева при нажатии, px"))}
        </div>
      </details>
      {buttonIconPath(block.type === "btn" ? block.icon : undefined) && buttonState === "normal" && <>
        {slider("buttonStyleByBp", "iconSize", "Размер иконки кнопки, px", 8, 128, 16)}
        {slider("buttonStyleByBp", "iconGap", "Расстояние до иконки, px", 0, 128, 8)}
      </>}
      {buttonState !== "normal" && slider("buttonStyleByBp", "duration", "Длительность перехода, мс", 0, 2000, 150, 10)}
    </>}
    {block.type === "img" && <>
      <div className="text-sm font-semibold">Изображение</div>
      <div role="group" aria-label="Состояние изображения" className="grid grid-cols-2 gap-2">
        {([["normal", "Обычное"], ["hover", "Наведение"]] as const).map(([state, label]) => <button key={state} type="button" aria-pressed={imageState === state} onClick={() => setImageState(state)} className={`rounded border px-2 py-1.5 text-xs ${imageState === state ? "border-[#8b78ff] bg-[#29214d] text-white" : "border-[#393e59] text-[#c9d0e9]"}`}>{label}</button>)}
      </div>
      {imageState === "normal" && <>
      <Field label="Выравнивание изображения"><select className={input} value={image.align ?? ""} onChange={e => update("imageStyleByBp", "align", e.target.value)}><option value="">Наследовать</option><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field>
      {slider("imageStyleByBp", "width", "Ширина изображения, %", 1, 200, 100)}
      {slider("imageStyleByBp", "maxWidth", "Максимальная ширина изображения, %", 1, 200, 100)}
      {slider("imageStyleByBp", "height", "Высота изображения, px", 0, 1600)}
      <Field label="Вписывание изображения"><select className={input} value={image.fit ?? ""} onChange={e => update("imageStyleByBp", "fit", e.target.value)}>
        <option value="">Наследовать</option><option value="contain">Вписать</option><option value="cover">Заполнить</option><option value="fill">Растянуть</option><option value="none">Без изменения</option><option value="scale-down">Уменьшить при необходимости</option>
      </select></Field>
      </>}
      {imageState === "hover" && <p className="text-xs text-[#c9d0e9]">Наведите курсор на изображение. Если задана ссылка, состояние также доступно при фокусе с клавиатуры.</p>}
      {slider("imageStyleByBp", imageState === "normal" ? "opacity" : "hoverOpacity", imageState === "normal" ? "Непрозрачность изображения, %" : "Непрозрачность при наведении, %", 0, 100, 100)}
      <CornerControl key={block.id + device + imageState} block={block} device={device} state={imageState} onPatch={onPatch} />
      {slider("imageStyleByBp", imageState === "normal" ? "radius" : "hoverRadius", imageState === "normal" ? "Скругление изображения, px" : "Скругление при наведении, px", 0, 512)}
      <Field label={imageState === "normal" ? "Тип рамки изображения" : "Тип рамки изображения при наведении"}><select className={input} value={image[imageState === "normal" ? "borderType" : "hoverBorderType"] ?? ""} onChange={e => update("imageStyleByBp", imageState === "normal" ? "borderType" : "hoverBorderType", e.target.value)}><option value="">Наследовать</option><option value="none">Без рамки</option><option value="solid">Сплошная</option><option value="double">Двойная</option><option value="dotted">Точечная</option><option value="dashed">Штриховая</option><option value="groove">Объёмная</option></select></Field>
      {slider("imageStyleByBp", imageState === "normal" ? "borderWidth" : "hoverBorderWidth", imageState === "normal" ? "Рамка изображения, px" : "Рамка изображения при наведении, px", 0, 32)}
      <Field label={imageState === "normal" ? "Цвет рамки изображения (HEX)" : "Цвет рамки изображения при наведении (HEX)"}><input className={input} value={image[imageState === "normal" ? "borderColor" : "hoverBorderColor"] ?? ""} onChange={e => update("imageStyleByBp", imageState === "normal" ? "borderColor" : "hoverBorderColor", e.target.value)} placeholder="Наследовать" /></Field>
      <details className="rounded-lg border border-[#393e59] px-2 py-2"><summary className="cursor-pointer text-xs">Фильтры изображения</summary><div className="mt-3 grid gap-3">
        {([["Brightness", "Яркость", 200, 100], ["Contrast", "Контраст", 200, 100], ["Saturate", "Насыщенность", 200, 100], ["Blur", "Размытие", 30, 0]] as const).map(([name, label, max, fallback]) => slider("imageStyleByBp", imageState === "normal" ? name[0].toLowerCase() + name.slice(1) : `hover${name}`, `${label}${imageState === "hover" ? " при наведении" : ""}, ${name === "Blur" ? "px" : "%"}`, 0, max, fallback))}
      </div></details>
      <details className="rounded-lg border border-[#393e59] px-2 py-2"><summary className="cursor-pointer text-xs">Тень изображения</summary><div className="mt-3 grid gap-3">
        <Field label={imageState === "normal" ? "Тень изображения" : "Тень изображения при наведении"}><select className={input} value={image[imageState === "normal" ? "shadowMode" : "hoverShadowMode"] ?? ""} onChange={e => update("imageStyleByBp", imageState === "normal" ? "shadowMode" : "hoverShadowMode", e.target.value)}><option value="">Наследовать</option><option value="on">Настроить</option><option value="off">Без тени</option></select></Field>
        {imageResolved[imageState === "normal" ? "shadowMode" : "hoverShadowMode"] === "on" && <>
          <Field label={imageState === "normal" ? "Цвет тени изображения (HEX)" : "Цвет тени изображения при наведении (HEX)"}><input className={input} value={image[imageState === "normal" ? "shadowColor" : "hoverShadowColor"] ?? ""} onChange={e => update("imageStyleByBp", imageState === "normal" ? "shadowColor" : "hoverShadowColor", e.target.value)} placeholder="#00000080" /></Field>
          {([["ShadowX", "Смещение тени по горизонтали", -128, 128, 0], ["ShadowY", "Смещение тени по вертикали", -128, 128, 4], ["ShadowBlur", "Размытие тени", 0, 128, 12], ["ShadowSpread", "Расширение тени", -128, 128, 0]] as const).map(([name, label, min, max, fallback]) => slider("imageStyleByBp", imageState === "normal" ? name[0].toLowerCase() + name.slice(1) : `hover${name}`, `${label} изображения${imageState === "hover" ? " при наведении" : ""}, px`, min, max, fallback))}
        </>}
      </div></details>
      {imageState === "hover" && slider("imageStyleByBp", "duration", "Длительность перехода изображения, мс", 0, 2000, 150, 10)}
      {imageState === "normal" && block.caption && <details className="rounded-lg border border-[#393e59] px-2 py-2"><summary className="cursor-pointer text-xs">Оформление подписи</summary><div className="mt-3 grid gap-3">
        <Field label="Выравнивание подписи"><select className={input} value={image.captionAlign ?? ""} onChange={e => update("imageStyleByBp", "captionAlign", e.target.value)}><option value="">Наследовать</option><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option><option value="justify">По ширине</option></select></Field>
        <Field label="Шрифт подписи"><select className={input} value={image.captionFont ?? ""} onChange={e => update("imageStyleByBp", "captionFont", e.target.value)}><option value="">Наследовать</option><option value="system-ui">Системный</option><option value="sans-serif">Без засечек</option><option value="serif">С засечками</option><option value="monospace">Моноширинный</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option></select></Field>
        {slider("imageStyleByBp", "captionSize", "Размер подписи, px", 1, 256, 16)}
        {slider("imageStyleByBp", "captionWeight", "Насыщенность подписи", 100, 900, 400, 100)}
        {slider("imageStyleByBp", "captionLineHeight", "Межстрочный интервал подписи", .5, 4, 1.5, .1)}
        {slider("imageStyleByBp", "captionSpacing", "Расстояние до подписи, px", 0, 256, 8)}
        <Field label="Цвет подписи (HEX)"><input className={input} value={image.captionColor ?? ""} onChange={e => update("imageStyleByBp", "captionColor", e.target.value)} placeholder="#333333" /></Field>
      </div></details>}
    </>}
    <div className="text-sm font-semibold">Оформление блока</div>
    <SpacingControl block={block} device={device} kind="padding" onPatch={onPatch} />
    <SpacingControl block={block} device={device} kind="margin" onPatch={onPatch} />
    <details className="rounded border px-2 py-1"><summary>Тень блока</summary><div className="grid gap-2 py-2">
      {styleChoice("blockShadow", "Тип тени блока", [["none", "Без тени"], ["outer", "Внешняя"], ["inset", "Внутренняя"]])}
      {(resolved.blockShadow === "outer" || resolved.blockShadow === "inset") && <>
        {styleColor("blockShadowColor", "Цвет тени блока (HEX)")}
        {slider("styleByBp", "blockShadowX", "Смещение тени блока по X, px", -256, 256)}
        {slider("styleByBp", "blockShadowY", "Смещение тени блока по Y, px", -256, 256, 8)}
        {slider("styleByBp", "blockShadowBlur", "Размытие тени блока, px", 0, 256, 24)}
        {slider("styleByBp", "blockShadowSpread", "Распространение тени блока, px", -256, 256)}
      </>}
    </div></details>
    {slider("styleByBp", "br", "Скругление, px", 0, 512)}
    {slider("styleByBp", "w", "Ширина блока, %", 1, 200, 100)}
    {slider("styleByBp", "minh", "Минимальная высота блока, px", 0, 1200)}
    {slider("styleByBp", "op", "Непрозрачность блока, %", 0, 100, 100)}
    <Field label="Цвет фона (HEX)"><input className={input} value={current.bg ?? ""} onChange={e => change("bg", e.target.value)} placeholder="#ffffff" /></Field>
    {current.bg && !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(current.bg)) && <p className="text-xs text-amber-300">Для публикации введите цвет в формате HEX, например #ffffff.</p>}
    <details className="rounded border px-2 py-1"><summary>Градиент фона</summary><div className="grid gap-2 py-2">
      {styleChoice("backgroundType", "Тип градиента", [["none", "Без градиента"], ["linear", "Линейный"], ["radial", "Радиальный"]])}
      {(resolved.backgroundType === "linear" || resolved.backgroundType === "radial") && <>
        {styleColor("gradientFrom", "Первый цвет градиента (HEX)", "#6e59f2")}
        {slider("styleByBp", "gradientStart", "Положение первого цвета, %", 0, 100, 0)}
        {styleColor("gradientTo", "Второй цвет градиента (HEX)", "#d9d1ff")}
        {slider("styleByBp", "gradientEnd", "Положение второго цвета, %", 0, 100, 100)}
        {resolved.backgroundType === "linear" && slider("styleByBp", "gradientAngle", "Угол градиента, °", 0, 360, 180)}
        {resolved.backgroundType === "radial" && <>
          {slider("styleByBp", "gradientX", "Центр градиента по X, %", 0, 100, 50)}
          {slider("styleByBp", "gradientY", "Центр градиента по Y, %", 0, 100, 50)}
        </>}
      </>}
    </div></details>
    {slider("styleByBp", "bw", "Ширина рамки, px", 0, 512)}
    <Field label="Стиль рамки"><select className={input} value={current.bs ?? ""} onChange={e => change("bs", e.target.value)}>
      <option value="">Наследовать</option><option value="none">Без рамки</option><option value="solid">Сплошная</option><option value="dashed">Штриховая</option><option value="dotted">Точечная</option>
    </select></Field>
    <Field label="Цвет рамки (HEX)"><input className={input} value={current.bc ?? ""} onChange={e => change("bc", e.target.value)} placeholder="#ffffff" /></Field>
    {current.bc && !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(current.bc)) && <p className="text-xs text-amber-300">Цвет рамки должен быть задан в формате HEX.</p>}
    {["h1", "heading", "p", "btn"].includes(block.type) && <>
      <div className="text-sm font-semibold">Типографика</div>
      <Field label="Шрифт"><select className={input} value={current.ff ?? ""} onChange={e => change("ff", e.target.value)}>
        <option value="">Наследовать</option><option value="system-ui">Системный</option><option value="sans-serif">Без засечек</option><option value="serif">С засечками</option><option value="monospace">Моноширинный</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option>
      </select></Field>
      {slider("styleByBp", "fs", "Размер текста, px", 1, 256, 16)}
      <Field label="Насыщенность"><select className={input} value={current.fw ?? ""} onChange={e => change("fw", e.target.value)}><option value="">Наследовать</option>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
      {slider("styleByBp", "lh", "Межстрочный интервал", 0.5, 4, 1.5, 0.1)}
      {styleChoice("fontStyle", "Начертание", [["normal", "Обычное"], ["italic", "Курсив"], ["oblique", "Наклонное"]])}
      {styleChoice("textTransform", "Регистр букв", [["none", "Исходный"], ["uppercase", "Прописные"], ["lowercase", "Строчные"], ["capitalize", "С заглавной"]])}
      {styleChoice("decoration", "Украшение текста", [["none", "Без линии"], ["underline", "Подчёркивание"], ["overline", "Линия сверху"], ["line-through", "Зачёркивание"]])}
      {slider("styleByBp", "letterSpacing", "Межбуквенный интервал, px", -32, 100, 0, 0.1)}
      {slider("styleByBp", "wordSpacing", "Межсловный интервал, px", -32, 100, 0, 0.1)}
      <details className="rounded border px-2 py-1"><summary>Тень и обводка текста</summary><div className="grid gap-2 py-2">
        {styleChoice("textShadow", "Тень текста", [["off","Без тени"],["on","Настроить"]])}
        {resolved.textShadow === "on" && <>
          {styleColor("textShadowColor","Цвет тени текста (HEX)")}
          {slider("styleByBp", "textShadowX", "Смещение тени текста по X, px", -128, 128)}
          {slider("styleByBp", "textShadowY", "Смещение тени текста по Y, px", -128, 128, 2)}
          {slider("styleByBp", "textShadowBlur", "Размытие тени текста, px", 0, 128, 4)}
        </>}
        {slider("styleByBp", "strokeWidth", "Обводка текста, px", 0, 20, 0, 0.1)}
        {styleColor("strokeColor", "Цвет обводки текста (HEX)")}
      </div></details>
      {(block.type === "h1" || block.type === "heading") && <>
        {styleColor("textHoverColor", "Цвет заголовка при наведении (HEX)")}
        {styleChoice("blend", "Режим смешивания", blendModes.map((value, i) => [value, ["Обычный","Умножение","Экран","Перекрытие","Затемнение","Осветление","Осветление основы","Затемнение основы","Жёсткий свет","Мягкий свет","Разница","Исключение","Цветовой тон","Насыщенность","Цвет","Яркость"][i]]))}
      </>}
      <Field label="Цвет текста (HEX)"><input className={input} value={current.tc ?? ""} onChange={e => change("tc", e.target.value)} placeholder="#000000" /></Field>
      {current.tc && !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(current.tc)) && <p className="text-xs text-amber-300">Цвет текста должен быть задан в формате HEX.</p>}
      <Field label="Выравнивание текста"><select className={input} value={current.ta ?? ""} onChange={e => change("ta", e.target.value)}><option value="">Наследовать</option><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option><option value="justify">По ширине</option></select></Field>
    </>}
  </div>;
}
