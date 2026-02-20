import { computeEsm } from "./esm";
import type { ContactCapabilities, PrivacyProfile } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mkContact(id: string, supportsAnon: boolean, supportsFast: boolean): ContactCapabilities {
  return { contactId: id, supportsAnon, supportsFast };
}

function run(localProfile: PrivacyProfile, contact: ContactCapabilities) {
  return computeEsm(localProfile, contact);
}

const cases: Array<[string, () => void]> = [
  [
    "anon profile + contact supports anon => anon/commonPath",
    () => {
      const esm = run("anon", mkContact("c1", true, true));
      assert(esm.family === "anon", "family must be anon");
      assert(esm.compat === false, "compat must be false");
      assert(esm.commonPath === true, "commonPath must be true");
    },
  ],
  [
    "anon profile + contact doesn't support anon => fail-closed",
    () => {
      const esm = run("anon", mkContact("c2", false, true));
      assert(esm.family === "anon", "family must be anon");
      assert(esm.commonPath === false, "commonPath must be false");
      assert(esm.compat === false, "compat must be false (anon profile isn't compat)");
    },
  ],
  [
    "fast profile + contact supports fast => fast/commonPath",
    () => {
      const esm = run("fast", mkContact("c3", true, true));
      assert(esm.family === "fast", "family must be fast");
      assert(esm.compat === false, "compat must be false");
      assert(esm.commonPath === true, "commonPath must be true");
    },
  ],
  [
    "fast profile + contact only anon => compat anon",
    () => {
      const esm = run("fast", mkContact("c4", true, false));
      assert(esm.family === "anon", "family must be anon (compat)");
      assert(esm.compat === true, "compat must be true");
      assert(esm.commonPath === true, "commonPath must be true");
    },
  ],
  [
    "fast profile + contact no anon/no fast => fail-closed",
    () => {
      const esm = run("fast", mkContact("c5", false, false));
      assert(esm.family === "anon", "family must be anon");
      assert(esm.compat === true, "compat must be true");
      assert(esm.commonPath === false, "commonPath must be false");
    },
  ],
];

for (const [name, fn] of cases) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[esm.test] ${name}: ${msg}`);
  }
}

export {};
