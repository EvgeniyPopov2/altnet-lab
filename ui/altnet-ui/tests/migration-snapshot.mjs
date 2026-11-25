import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";

// Только синтетические данные в новых временных браузерных контекстах.
const url = "http://127.0.0.1:5179/__migration_test__";
const launches = [
  ["chromium", chromium, { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" }],
  ["firefox", firefox, {}],
  ["webkit", webkit, {}],
];
let encrypted, key;
for (const [name, engine, options] of launches) {
  const browser = await engine.launch(options);
  const context = await browser.newContext();
  try {
    await context.route("**/__migration_test__", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Тест переноса</title>" }));
    const page = await context.newPage();
    await page.goto(url);
    if (name === "chromium") {
      const result = await page.evaluate(async () => {
        const { encryptStableBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const { newTransferKey } = await import("/src/core/migration/encryptedTransfer.ts");
        localStorage.setItem("altnet.profile.v1", "fast");
        localStorage.setItem("altnet.dm.synthetic.journal.v1", "Синтетическое сообщение");
        localStorage.setItem("unrelated", "do-not-copy");
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("altnet-ipfs-site-cache", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("cars");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction("cars", "readwrite");
          tx.objectStore("cars").put(Uint8Array.from([0, 1, 2, 250, 255]).buffer, "profile:fast:test");
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
        db.close();
        for (const [name, store, entries] of [
          ["altnet-published-sites", "records", [["meta:test", { slug: "test", title: "Тест", createdAt: 1, updatedAt: 1 }], ["html:test", "<h1>Тест</h1>"]]],
          ["altnet-sitebuilder-drafts", "drafts", [["current", '{"draft":"Синтетика"}']]],
        ]) {
          const next = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name, 1); request.onupgradeneeded = () => request.result.createObjectStore(store);
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const tx = next.transaction(store, "readwrite"); for (const [entryKey, value] of entries) tx.objectStore(store).put(value, entryKey);
            tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
          });
          next.close();
        }
        const transferKey = newTransferKey();
        const value = await encryptStableBrowserSnapshot(transferKey);
        return { value, key: Array.from(transferKey), original: localStorage.getItem("altnet.dm.synthetic.journal.v1") };
      });
      assert.equal(result.original, "Синтетическое сообщение");
      assert.equal(result.value.includes("Синтетическое"), false);
      encrypted = result.value; key = result.key;
      const changing = await page.evaluate(async () => {
        const { encryptStableBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const original = Storage.prototype.getItem; let reads = 0;
        Storage.prototype.getItem = function(name) { const value = original.call(this, name); return name === "altnet.profile.v1" && ++reads > 1 ? "anon" : value; };
        try { await encryptStableBrowserSnapshot(new Uint8Array(32)); return false; } catch { return true; }
        finally { Storage.prototype.getItem = original; }
      });
      assert.equal(changing, true, "Меняющийся источник нельзя выдавать за согласованный снимок");
      const unsupported = await page.evaluate(async () => {
        const { encryptStableBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("altnet-ipfs-site-cache"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => { const tx = db.transaction("cars", "readwrite"); tx.objectStore("cars").put(new Date(), "unsupported"); tx.oncomplete = resolve; tx.onabort = reject; });
        try { await encryptStableBrowserSnapshot(new Uint8Array(32)); return false; }
        catch { return true; }
        finally { db.close(); }
      });
      assert.equal(unsupported, true, "Неизвестные типы нельзя изменять или пропускать");
      const blocked = await page.evaluate(async () => {
        const { encryptStableBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const request = indexedDB.open("altnet-unknown-test", 1);
        await new Promise((resolve, reject) => { request.onupgradeneeded = () => request.result.createObjectStore("unknown"); request.onsuccess = resolve; request.onerror = reject; });
        request.result.close();
        try { await encryptStableBrowserSnapshot(new Uint8Array(32)); return false; } catch { return true; }
      });
      assert.equal(blocked, true, "Неизвестные базы нельзя молча пропускать");
    } else {
      const result = await page.evaluate(async ({ envelope, keyBytes }) => {
        const { decryptTransfer } = await import("/src/core/migration/encryptedTransfer.ts");
        const { validateBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const data = validateBrowserSnapshot(await decryptTransfer(envelope, Uint8Array.from(keyBytes)));
        const wrong = Uint8Array.from(keyBytes); wrong[0] ^= 1;
        let rejected = false;
        try { await decryptTransfer(envelope, wrong); } catch { rejected = true; }
        const bad = [
          { ...data, local: [...data.local, data.local[0]] },
          { ...data, local: [["unrelated", "secret"]] },
          { ...data, databases: [{ name: "unknown", records: [] }] },
          { ...data, databases: [{ name: "altnet-ipfs-site-cache", records: [["key", { kind: "bytes", value: "%%%" }]] }] },
        ];
        let invalid = 0;
        for (const item of bad) try { validateBrowserSnapshot(new TextEncoder().encode(JSON.stringify(item))); } catch { invalid++; }
        return { data, rejected, invalid, targetEmpty: localStorage.getItem("altnet.dm.synthetic.journal.v1") === null };
      }, { envelope: encrypted, keyBytes: key });
      assert.equal(result.rejected, true);
      assert.equal(result.invalid, 4);
      assert.equal(result.targetEmpty, true, "Расшифровка не должна записывать данные");
      assert.deepEqual(result.data.local, [["altnet.dm.synthetic.journal.v1", "Синтетическое сообщение"], ["altnet.profile.v1", "fast"]]);
      assert.deepEqual(result.data.databases, [
        { name: "altnet-ipfs-site-cache", records: [["profile:fast:test", { kind: "bytes", value: "AAEC+v8=" }]] },
        { name: "altnet-published-sites", records: [["html:test", { kind: "json", value: "<h1>Тест</h1>" }], ["meta:test", { kind: "json", value: { slug: "test", title: "Тест", createdAt: 1, updatedAt: 1 } }]] },
        { name: "altnet-sitebuilder-drafts", records: [["current", { kind: "json", value: '{"draft":"Синтетика"}' }]] },
      ]);
      const sourceProbe = await page.evaluate(async () => {
        const { encryptStableBrowserSnapshot, validateBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const { newTransferKey, decryptTransfer } = await import("/src/core/migration/encryptedTransfer.ts");
        localStorage.setItem("altnet.test.cross-browser", "синтетика");
        const key = newTransferKey();
        return validateBrowserSnapshot(await decryptTransfer(await encryptStableBrowserSnapshot(key), key)).local;
      });
      assert.deepEqual(sourceProbe, [["altnet.test.cross-browser", "синтетика"]]);
      const staged = await page.evaluate(async ({ envelope, keyBytes }) => {
        const { stageEncryptedSnapshot, readStagedSnapshot } = await import("/src/core/migration/stagedTransfer.ts");
        const { validateBrowserSnapshot } = await import("/src/core/migration/browserSnapshot.ts");
        const { encryptTransfer } = await import("/src/core/migration/encryptedTransfer.ts");
        const key = Uint8Array.from(keyBytes);
        const wrong = key.slice(); wrong[0] ^= 1;
        let badRejected = false;
        try { await stageEncryptedSnapshot(envelope, wrong); } catch { badRejected = true; }
        let malformedRejected = false;
        try { await stageEncryptedSnapshot(await encryptTransfer(new TextEncoder().encode('{"version":1,"local":[["unrelated","bad"]],"databases":[]}'), key), key); }
        catch { malformedRejected = true; }
        const before = await indexedDB.databases();
        const id = await stageEncryptedSnapshot(envelope, key);
        const verified = validateBrowserSnapshot(await readStagedSnapshot(id, key));
        let wrongRejected = false;
        try { await readStagedSnapshot(id, wrong); } catch { wrongRejected = true; }
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("altnet-migration-staging"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const stored = await new Promise((resolve, reject) => { const tx = db.transaction("encrypted", "readonly"); const request = tx.objectStore("encrypted").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        db.close();
        return { badRejected, malformedRejected, wrongRejected, stagingExisted: before.some(item => item.name === "altnet-migration-staging"), stored, verified,
                 original: localStorage.getItem("altnet.test.cross-browser"), target: localStorage.getItem("altnet.dm.synthetic.journal.v1") };
      }, { envelope: encrypted, keyBytes: key });
      assert.equal(staged.badRejected, true);
      assert.equal(staged.malformedRejected, true);
      assert.equal(staged.wrongRejected, true);
      assert.equal(staged.stagingExisted, false, "Неверный ключ не должен создавать базу");
      assert.deepEqual(staged.stored, { version: 1, envelope: encrypted });
      assert.deepEqual(staged.verified, result.data);
      assert.equal(staged.original, "синтетика");
      assert.equal(staged.target, null, "Подготовка не должна восстанавливать записи приложения");
    }
    console.log(`${name} PASS: зашифрованный снимок не изменяет хранилище`);
  } finally {
    await context.close();
    await browser.close();
  }
}
