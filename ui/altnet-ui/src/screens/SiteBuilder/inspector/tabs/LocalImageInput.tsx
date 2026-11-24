import { useContext, useEffect, useRef, useState } from "react";
import { addMediaAsset, imageFileTypes, prepareMediaAsset } from "../../mediaLibrary";
import { MediaLibraryContext } from "../../mediaLibraryContext";
import MediaLibraryButton from "../../MediaLibraryButton";
import type { MediaAsset } from "../../types";

export default function LocalImageInput({ onLoad }: { onLoad: (dataUrl: string, asset: MediaAsset) => void }) {
  const library = useContext(MediaLibraryContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <div className="grid gap-1 text-xs text-[#c9d0e9]">
    <label className="grid gap-1">Выбрать изображение с устройства
      <input type="file" accept={imageFileTypes} disabled={busy} onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        setError(""); setBusy(true);
        try {
          const prepared = await prepareMediaAsset(file);
          if (!mounted.current) return;
          const asset = library?.assets.find(item => item.id === prepared.id) ?? prepared;
          library?.update(doc => addMediaAsset(doc, asset));
          onLoad(asset.dataUrl, asset);
        } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Не удалось обработать изображение."); }
        finally { if (mounted.current) setBusy(false); }
      }} />
    </label>
    <MediaLibraryButton onSelect={asset => onLoad(asset.dataUrl, asset)} />
    <span>{busy ? "Обрабатываем изображение…" : "PNG, JPEG, WebP или GIF до 10 МиБ. GIF сохраняется как статичное изображение."}</span>
    {error && <span role="alert" className="text-red-300">{error}</span>}
  </div>;
}
