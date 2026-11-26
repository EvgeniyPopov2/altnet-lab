import { parseBrowserAddress } from "./browserNavigation";
import type { PrivacyProfile } from "../policy/types";

const PREFIX = "#altnet-view?";
const TYPED_PREFIX = "#altnet-open?";
export type SiteTabAddress = { address: string; profile: PrivacyProfile };

export function siteTabHash(address: string, profile: PrivacyProfile): string {
  const parsed = parseBrowserAddress(address);
  if ((parsed.kind !== "site" && parsed.kind !== "ipfs") || (profile !== "anon" && profile !== "fast")) throw new Error("Этот адрес нельзя открыть как локальный сайт.");
  return PREFIX + new URLSearchParams({ address: parsed.url, profile }).toString();
}

export function parseSiteTabHash(hash: string): SiteTabAddress | null {
  if (hash.startsWith(TYPED_PREFIX) && hash.length <= 8192) {
    const params = new URLSearchParams(hash.slice(TYPED_PREFIX.length));
    const address = params.get("address");
    const profile = params.get("profile") ?? "anon";
    if ((profile !== "anon" && profile !== "fast") || params.getAll("address").length !== 1 || params.getAll("profile").length > 1 || [...params.keys()].some(k => k !== "address" && k !== "profile") || !address || !/^(?:alt|ipfs):\/\//.test(address)) return null;
    try {
      const parsed = parseBrowserAddress(address);
      return parsed.kind === "site" || parsed.kind === "ipfs" || (parsed.kind === "onion-share" && profile === "anon") ? { address: parsed.url, profile } : null;
    } catch { return null; }
  }
  if (!hash.startsWith(PREFIX) || hash.length > 8192) return null;
  const params = new URLSearchParams(hash.slice(PREFIX.length));
  if ([...params.keys()].length !== 2 || params.getAll("address").length !== 1 || params.getAll("profile").length !== 1) return null;
  const address = params.get("address"), profile = params.get("profile");
  if (!address || (profile !== "anon" && profile !== "fast")) return null;
  try {
    const result = parseBrowserAddress(address);
    if ((result.kind !== "site" && result.kind !== "ipfs") || result.url !== address) return null;
    return { address, profile };
  } catch { return null; }
}

export function isSiteTabHash(hash: string): boolean { return hash.startsWith(PREFIX) || hash.startsWith(TYPED_PREFIX); }
