import { useEffect, useState, type RefObject } from "react";
import { prepareLocalSite } from "../core/sites/localPreview";

type Props = {
  html: string;
  paths: string[];
  fragment: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
};
export default function LocalSiteFrame({ html, paths, fragment, title, frameRef }: Props) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const pathKey = JSON.stringify(paths);
  useEffect(() => {
    let active = true;
    setSrc("");
    setError(false);
    prepareLocalSite(html, JSON.parse(pathKey) as string[], fragment)
      .then((result) => {
        if (active) setSrc(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [html, pathKey, fragment]);
  if (error) return <p role="alert">Не удалось открыть локальную страницу.</p>;
  return src ? (
    <iframe ref={frameRef} title={title} sandbox="allow-scripts" srcDoc={src} className="w-full h-[70vh] bg-white" />
  ) : (
    <p role="status">Открываем страницу…</p>
  );
}
