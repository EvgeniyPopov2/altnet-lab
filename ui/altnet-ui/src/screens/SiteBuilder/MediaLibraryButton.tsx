import { useContext, useEffect, useRef, useState } from "react";
import { Images, Upload, X } from "lucide-react";
import { addMediaAsset, deleteMediaAsset, editMediaAsset, imageFileTypes, prepareMediaAsset } from "./mediaLibrary";
import { MediaLibraryContext } from "./mediaLibraryContext";
import type { MediaAsset } from "./types";

export default function MediaLibraryButton({ onSelect }: { onSelect?: (asset: MediaAsset) => void }) {
  const library = useContext(MediaLibraryContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedId, select] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (opened && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [opened]);
  if (!library) return null;
  const assets = library.assets;
  const visible = opened
    ? assets.filter((asset) =>
        [asset.name, asset.alt, asset.caption].some((text) =>
          text.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
        )
      )
    : [];
  const selected = visible.find((asset) => asset.id === selectedId) ?? visible[0];
  const edit = (patch: Partial<Pick<MediaAsset, "name" | "alt" | "caption">>) => {
    if (selected) library.update((doc) => editMediaAsset(doc, selected.id, patch));
  };
  return (
    <>
      <button
        className="sb-media-open"
        type="button"
        onClick={() => {
          setFilter("");
          setError("");
          setOpened(true);
        }}
      >
        <Images size={15} aria-hidden="true" />
        {onSelect ? "Выбрать из медиатеки" : "Медиатека проекта"}
      </button>
      <dialog ref={dialog} className="sb-media-dialog" aria-label="Медиатека проекта" onClose={() => setOpened(false)}>
        {opened && (
          <>
            <header>
              <h2>Медиатека проекта</h2>
              <button aria-label="Закрыть медиатеку" type="button" onClick={() => dialog.current?.close()}>
                <X size={18} />
              </button>
            </header>
            <div className="sb-media-tools">
              <input
                autoFocus
                type="search"
                aria-label="Поиск изображений"
                placeholder="Найти изображение"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <label className="sb-media-upload">
                <Upload size={15} />
                Добавить файлы
                <input
                  type="file"
                  aria-label="Добавить файлы в медиатеку"
                  accept={imageFileTypes}
                  multiple
                  disabled={busy}
                  onChange={async (event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    setBusy(true);
                    setError("");
                    const failures: string[] = [];
                    for (const file of files) {
                      if (!mounted.current) break;
                      try {
                        const asset = await prepareMediaAsset(file);
                        if (!mounted.current) break;
                        library.update((doc) => addMediaAsset(doc, asset));
                        setFilter("");
                        select(asset.id);
                      } catch (cause) {
                        failures.push(
                          file.name + " — " + (cause instanceof Error ? cause.message : "Не удалось обработать файл.")
                        );
                      }
                    }
                    if (mounted.current) {
                      setBusy(false);
                      setError(failures.join("\n"));
                    }
                  }}
                />
              </label>
            </div>
            {busy && <p role="status">Обрабатываем изображения…</p>}
            {error && <p role="alert">{error}</p>}
            <div className="sb-media-body">
              <div className="sb-media-tiles" aria-label="Изображения проекта">
                {visible.map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    aria-pressed={asset.id === selected?.id}
                    onClick={() => select(asset.id)}
                  >
                    <img src={asset.dataUrl} alt="" loading="lazy" />
                    <span>{asset.name}</span>
                  </button>
                ))}
                {!visible.length && (
                  <p>{assets.length ? "Совпадений нет" : "Добавьте первое изображение с устройства."}</p>
                )}
              </div>
              {selected && (
                <div className="sb-media-fields">
                  <label>
                    Имя файла
                    <input value={selected.name} onChange={(e) => edit({ name: e.target.value })} />
                  </label>
                  <label>
                    Альтернативный текст
                    <input value={selected.alt} onChange={(e) => edit({ alt: e.target.value })} />
                  </label>
                  <label>
                    Подпись в медиатеке
                    <textarea value={selected.caption} onChange={(e) => edit({ caption: e.target.value })} />
                  </label>
                  {onSelect && (
                    <button
                      className="sb-media-use"
                      type="button"
                      onClick={() => {
                        onSelect(selected);
                        dialog.current?.close();
                      }}
                    >
                      Вставить изображение
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Удалить изображение из медиатеки? Вставленные на страницы копии сохранятся."))
                        library.update((doc) => deleteMediaAsset(doc, selected.id));
                    }}
                  >
                    Удалить из медиатеки
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
