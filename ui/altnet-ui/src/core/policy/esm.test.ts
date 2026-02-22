import { describe, expect, it } from "vitest";

import { computeEsm } from "./esm";
import type { ContactCapabilities, PrivacyProfile } from "./types";

function mkContact(id: string, supportsAnon: boolean, supportsFast: boolean): ContactCapabilities {
  return { contactId: id, supportsAnon, supportsFast };
}

function run(localProfile: PrivacyProfile, contact: ContactCapabilities) {
  return computeEsm(localProfile, contact);
}

describe("computeEsm", () => {
  it("anon profile + contact supports anon => anon/commonPath", () => {
    const esm = run("anon", mkContact("c1", true, true));
    expect(esm.family).toBe("anon");
    expect(esm.compat).toBe(false);
    expect(esm.commonPath).toBe(true);
  });

  it("anon profile + contact doesn't support anon => fail-closed", () => {
    const esm = run("anon", mkContact("c2", false, true));
    expect(esm.family).toBe("anon");
    expect(esm.commonPath).toBe(false);
    expect(esm.compat).toBe(false);
  });

  it("fast profile + contact supports fast => fast/commonPath", () => {
    const esm = run("fast", mkContact("c3", true, true));
    expect(esm.family).toBe("fast");
    expect(esm.compat).toBe(false);
    expect(esm.commonPath).toBe(true);
  });

  it("fast profile + contact only anon => compat anon", () => {
    const esm = run("fast", mkContact("c4", true, false));
    expect(esm.family).toBe("anon");
    expect(esm.compat).toBe(true);
    expect(esm.commonPath).toBe(true);
  });

  it("fast profile + contact no anon/no fast => fail-closed", () => {
    const esm = run("fast", mkContact("c5", false, false));
    expect(esm.family).toBe("anon");
    expect(esm.compat).toBe(true);
    expect(esm.commonPath).toBe(false);
  });
});
