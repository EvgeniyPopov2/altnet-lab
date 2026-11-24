import { createContext } from "react";
import type { Doc, MediaAsset } from "./types";

export const MediaLibraryContext = createContext<{
  assets: MediaAsset[];
  update: (change: (doc: Doc) => Doc) => void;
} | null>(null);
