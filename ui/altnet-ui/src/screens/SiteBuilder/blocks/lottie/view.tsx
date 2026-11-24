import { useEffect, useMemo, useState } from "react";
import { animationCss, animationMarkup, loadLottieRenderer, LOTTIE_HASH } from "../../../../builder/lottieRenderer";
import { readAnimation, lottieOptions } from "../../lottie";
import type { LottieBlock } from "../../types";

export default function LottieView({ block }: { block: LottieBlock }) {
  const [engine, setEngine] = useState("");
  const [failed, setFailed] = useState(false);
  const source = block.animationJson;
  const info = useMemo(() => {
    if (!source) return null;
    try { return readAnimation(source); } catch { return null; }
  }, [source]);
  useEffect(() => {
    if (!info) return;
    let active = true;
    loadLottieRenderer().then(value => { if (active) setEngine(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [info]);
  if (!info || !source || failed) return <figure className="grid min-h-20 place-content-center gap-2 rounded border border-dashed p-3 text-center text-xs">
    {block.poster && <img src={block.poster} alt="" />}
    <figcaption>{failed ? "Не удалось загрузить проигрыватель" : source ? "Файл анимации повреждён" : "Выберите файл Lottie JSON в настройках блока"}</figcaption></figure>;
  const options = lottieOptions(block);
  const policy = "default-src 'none'; script-src 'sha256-" + LOTTIE_HASH + "'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'";
  const html = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy +
    '"><style>body{margin:0;font:13px system-ui}' + animationCss + '</style>' + animationMarkup(source, "", options, block.poster) + '<script>' + engine + '</script>';
  return <figure style={{ width: options.width + "%", maxWidth: options.maxWidth, marginInline: options.align === "center" ? "auto" : options.align === "right" ? "auto 0" : "0 auto" }}>
    {engine && <iframe sandbox="allow-scripts" title={block.caption || "Анимация Lottie"} srcDoc={html} loading={options.lazy ? "lazy" : "eager"}
      style={{ width: "100%", aspectRatio: Number(info.w) / Number(info.h), minHeight: 90, border: 0 }} />}
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>;
}
