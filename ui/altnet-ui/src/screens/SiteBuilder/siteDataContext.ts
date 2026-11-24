import { createContext } from "react";
export const SiteDataContext = createContext<{ templates: { id: string; name: string }[]; fields: string[] }>({
  templates: [],
  fields: [],
});
