/* Проверка одноразового ответа дочернего локального клиента.
 * Это строительный блок: он не запускает клиента и не авторизует страницу. */
const PROTOCOL = "altnet-native-v1";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const AUTHORITY = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/;

function decodeToken(value) {
  if (typeof value !== "string" || !TOKEN.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const canonical = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return bytes.length === 32 && canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

export function createNativeChallenge() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyNativeProof(secret, authority, challenge, response) {
  const match = typeof authority === "string" && AUTHORITY.exec(authority);
  const nonce = decodeToken(challenge);
  const tag = response && typeof response === "object" && !Array.isArray(response) &&
    Object.keys(response).length === 2 && Object.hasOwn(response, "protocol") && Object.hasOwn(response, "proof") &&
    response.protocol === PROTOCOL ? decodeToken(response.proof) : null;
  // Browser actors and ES modules may use different JavaScript globals.
  if (!ArrayBuffer.isView(secret) || Object.prototype.toString.call(secret) !== "[object Uint8Array]" || secret.byteLength !== 32 || !match || match[0] !== authority || Number(match[1]) > 65535 || !nonce || !tag) return false;
  try {
    const prefix = new TextEncoder().encode(`${PROTOCOL}\0${authority}\0`);
    const payload = new Uint8Array(prefix.length + nonce.length);
    payload.set(prefix); payload.set(nonce, prefix.length);
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, tag, payload);
  } catch {
    return false;
  }
}
