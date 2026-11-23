import { useState } from "react";
import { tryReencodeToPng } from "../../../../builder/cdr";

const MAX_RESULT_BYTES = 2 * 1024 * 1024;
export default function LocalImageInput({ onLoad }: { onLoad: (dataUrl: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="grid gap-1 text-xs text-[#c9d0e9]">
    <label className="grid gap-1">Выбрать изображение с устройства
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        setError(""); setBusy(true);
        try {
          const cleaned = await tryReencodeToPng(file);
          if (cleaned.size > MAX_RESULT_BYTES) throw new Error("После обработки изображение больше 2 МиБ. Уменьшите его размер и выберите снова.");
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать изображение."));
            reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
            reader.readAsDataURL(cleaned);
          });
          onLoad(url);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обработать изображение."); }
        finally { setBusy(false); }
      }} />
    </label>
    <span>{busy ? "Обрабатываем изображение…" : "PNG, JPEG, WebP или GIF до 10 МиБ; GIF сохраняется как статичное изображение. Результат хранится в черновике."}</span>
    {error && <span role="alert" className="text-red-300">{error}</span>}
  </div>;
}
