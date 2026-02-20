// ui/altnet-ui/src/core/security/cdr.ts
// CDR (Content Disarm & Reconstruction) для загрузок файлов (MVP).
//
// Доктрина безопасности требует: любой загружаемый медиа/файл должен проходить
// очистку метаданных и/или CDR-конвейер, а CID должен считаться от очищенного результата.
//
// В рамках UI‑MVP реализуем минимальный вариант:
// - поддерживаем только изображения (png/jpeg/webp/gif)
// - перекодируем в PNG через canvas (срезает EXIF/XMP/комментарии)
// - остальные типы блокируем (fail‑closed)

export type CdrErrorCode = "TOO_LARGE" | "UNSUPPORTED_TYPE" | "DECODE_FAILED" | "ENCODE_FAILED";

export class CdrError extends Error {
  readonly code: CdrErrorCode;
  readonly details?: string;

  constructor(code: CdrErrorCode, message: string, details?: string) {
    super(message);
    this.name = "CdrError";
    this.code = code;
    this.details = details;
  }
}

export type CdrResult = {
  file: File;
  originalName: string;
  removedMetadata: boolean;
  notes: string[];
};

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB

const ALLOWED_IMAGE_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function safeBaseName(name: string): string {
  const v = (name ?? "").trim();
  if (!v) return "file";
  // Запрещаем пути вида C:\... или ../../...
  const base = v.split("/").pop()?.split("\\").pop() ?? "file";
  // Убираем нулевые/служебные символы
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, "");
  return cleaned || "file";
}

function replaceExt(name: string, extWithDot: string): string {
  const base = safeBaseName(name);
  const i = base.lastIndexOf(".");
  if (i <= 0) return `${base}${extWithDot}`;
  return `${base.slice(0, i)}${extWithDot}`;
}

async function reencodeToPng(blob: Blob): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new CdrError("DECODE_FAILED", "Не удалось декодировать изображение.", msg);
  }

  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CdrError("ENCODE_FAILED", "Canvas 2D недоступен для перекодирования.");
  ctx.drawImage(bmp, 0, 0);

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );

  if (!out) throw new CdrError("ENCODE_FAILED", "Не удалось перекодировать изображение в PNG.");
  return out;
}

/**
 * Минимальный CDR для файлов, которые пользователь прикрепляет в UI.
 * Сейчас поддерживает только изображения и блокирует остальное (fail‑closed).
 */
export async function cdrSanitizeUpload(file: File, maxBytes = DEFAULT_MAX_UPLOAD_BYTES): Promise<CdrResult> {
  const originalName = safeBaseName(file.name);

  if (file.size > maxBytes) {
    throw new CdrError(
      "TOO_LARGE",
      `Файл слишком большой для MVP (лимит ${Math.round(maxBytes / (1024 * 1024))} MiB).`
    );
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();

  // SVG блокируем: там возможны скрипты/ссылки/встраивания.
  if (mime === "image/svg+xml") {
    throw new CdrError("UNSUPPORTED_TYPE", "SVG заблокирован: небезопасный формат для предпросмотра.");
  }

  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new CdrError(
      "UNSUPPORTED_TYPE",
      "Формат вложения пока не поддерживается (CDR MVP поддерживает только изображения).",
      `mime=${mime || "(empty)"}`
    );
  }

  const cleanedBlob = await reencodeToPng(file);
  const cleanedName = replaceExt(originalName, ".png");

  const cleanedFile = new File([cleanedBlob], cleanedName, {
    type: "image/png",
    lastModified: Date.now(),
  });

  const notes = ["Изображение перекодировано в PNG (метаданные удалены)."];
  return {
    file: cleanedFile,
    originalName,
    removedMetadata: true,
    notes,
  };
}
