// Ключ профиля доступен только владельцу приложения.
import { gcm } from "@noble/ciphers/aes.js";
export function linuxRing() {
  const keyFile = Services.dirsvc.get("ProfD", Ci.nsIFile).clone();
  keyFile.append("altnet-workspace.key");
  if (!keyFile.isFile() || keyFile.isSymlink() || keyFile.fileSize !== 32 || (keyFile.permissions & 0o077)) throw Error("Ключ профиля недоступен");
  const file = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
  file.init(keyFile, 1, 0, 0);
  const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
  input.setInputStream(file);
  let key;
  try { key = Uint8Array.from(input.readByteArray(32)); } finally { input.close(); }
  const encoder = new TextEncoder();
  const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const encode = bytes => {
    let text = "";
    for (let n = 0; n < bytes.length; n += 8192) text += String.fromCharCode(...bytes.subarray(n, n+8192));
    return btoa(text);
  };
  return {
    seal(name, text) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const box = gcm(key, nonce, encoder.encode(name)).encrypt(encoder.encode(text));
      return "v1." + encode(nonce) + "." + encode(box);
    },
    open(name, text) {
      const [version, nonce, box, extra] = text.split(".");
      if (version !== "v1" || extra !== undefined) throw Error("Неизвестный формат записи");
      return new TextDecoder("utf-8", {fatal:true}).decode(gcm(key, decode(nonce), encoder.encode(name)).decrypt(decode(box)));
    }
  };
}
