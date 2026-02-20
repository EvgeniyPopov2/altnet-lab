import { useEffect, useState } from "react";
import type { PrivacyProfile } from "../policy/types";

const LS_KEY = "altnet.profile.v1";

export function getPrivacyProfile(): PrivacyProfile {
  if (typeof window === "undefined") return "anon";
  const v = window.localStorage.getItem(LS_KEY);
  return v === "fast" ? "fast" : "anon";
}

export function setPrivacyProfile(profile: PrivacyProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, profile);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("altnet:profile", { detail: { profile } }));
}

export function onPrivacyProfileChange(cb: (profile: PrivacyProfile) => void): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<{ profile: PrivacyProfile }>;
    const p = ce.detail?.profile === "fast" ? "fast" : "anon";
    cb(p);
  };
  window.addEventListener("altnet:profile", handler as EventListener);
  return () => window.removeEventListener("altnet:profile", handler as EventListener);
}

export function usePrivacyProfile(): [PrivacyProfile, (p: PrivacyProfile) => void] {
  const [profile, setProfile] = useState<PrivacyProfile>(() => getPrivacyProfile());

  useEffect(() => onPrivacyProfileChange(setProfile), []);

  return [profile, setPrivacyProfile];
}
