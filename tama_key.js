const KEY = "tama_key_v1", TAB_KEY = "tama_tab_key_v1";
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = ALPHA[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) s = "1" + s;
    else break;
  }
  return s;
}
function didOf(pub) {
  const raw = new Uint8Array(34);
  raw[0] = 237;
  raw[1] = 1;
  raw.set(pub, 2);
  return "did:key:z" + b58(raw);
}
const short8 = (did) => String(did).slice(-8);
async function supported() {
  try {
    return !!await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  } catch {
    return false;
  }
}
const ITER_NEW = 6e5, ITER_MIN = 25e4, ITER_MAX = 2e6;
const iterOf = (rec) => {
  const n = Number(rec?.kdf?.iterations ?? ITER_MIN);
  return Number.isInteger(n) && n >= ITER_MIN && n <= ITER_MAX ? n : null;
};
async function kdf(pass, salt, iterations = ITER_MIN) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealKey(priv, did, pass) {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", priv));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await kdf(pass, salt, ITER_NEW), pkcs8));
  return { v: 1, kind: "tama-key", did, kdf: { name: "PBKDF2-SHA256", iterations: ITER_NEW, salt: b64(salt) }, enc: { name: "AES-GCM", iv: b64(iv), ct: b64(ct) }, made: (new Date()).toISOString() };
}
async function didOfPriv(priv) {
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  return didOf(Uint8Array.from(atob(jwk.x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - jwk.x.length % 4) % 4)), (c) => c.charCodeAt(0)));
}
async function openKey(rec, pass) {
  const it = iterOf(rec);
  if (!it) throw new Error("kdf iterations");
  const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.enc.iv) }, await kdf(pass, unb64(rec.kdf.salt), it), unb64(rec.enc.ct));
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  if (await didOfPriv(priv) !== rec.did) throw new Error("key does not match did");
  return priv;
}
function loadRec() {
  try {
    const s = localStorage.getItem(KEY);
    const j = s ? JSON.parse(s) : null;
    return j && j.did ? j : null;
  } catch {
    return null;
  }
}
function dropRec() {
  try {
    localStorage.removeItem(KEY);
  } catch {
  }
  forgetTab();
}
function saveRec(rec) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}
const loginName = (did) => `HAKO \u2026${short8(did)}`;
async function offerSave(did, pass) {
  try {
    if (typeof PasswordCredential === "function" && navigator.credentials?.store) await navigator.credentials.store(new PasswordCredential({ id: loginName(did), password: pass, name: loginName(did) }));
  } catch {
  }
}
const NAME_MAX = 16;
const cleanName = (s) => [...sweep(String(s ?? "")).replace(/\s+/g, " ")].slice(0, NAME_MAX).join("").trim();
const nameOf = (rec, did) => rec?.did === did && cleanName(rec.name) || `HAKO \u2026${short8(did)}`;
function setName(name) {
  const rec = loadRec();
  if (!rec) return false;
  const n = cleanName(name);
  if (n) rec.name = n;
  else delete rec.name;
  return saveRec(rec);
}
const DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}$/;
function isKeyFile(j) {
  return !!(j && j.kind === "tama-key" && typeof j.did === "string" && DID_RE.test(j.did) && j.kdf && j.enc && iterOf(j));
}
function downloadRec(rec) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rec, null, 1)], { type: "application/json" }));
  a.download = `tama-key-${short8(rec.did).toLowerCase()}.json`;
  a.click();
}
async function rememberTab(priv, did) {
  try {
    sessionStorage.setItem(TAB_KEY, JSON.stringify({ did, pkcs8: b64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", priv))) }));
  } catch {
  }
}
async function recallTab(did) {
  try {
    const j = JSON.parse(sessionStorage.getItem(TAB_KEY) || "null");
    if (!j || j.did !== did) return null;
    return await crypto.subtle.importKey("pkcs8", unb64(j.pkcs8), { name: "Ed25519" }, true, ["sign"]);
  } catch {
    return null;
  }
}
function forgetTab() {
  try {
    sessionStorage.removeItem(TAB_KEY);
  } catch {
  }
}
async function makeKey(pass) {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const did = didOf(pub);
  return { priv: kp.privateKey, did, rec: await sealKey(kp.privateKey, did, pass) };
}
const sweep = (s) => String(s).replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ").trim();
async function signLine(priv, room, nonce, text) {
  return b64u(new Uint8Array(await crypto.subtle.sign("Ed25519", priv, enc.encode(`${room}|${nonce}|${sweep(text)}`))));
}
export {
  DID_RE,
  KEY,
  NAME_MAX,
  TAB_KEY,
  b64,
  b64u,
  cleanName,
  didOf,
  downloadRec,
  dropRec,
  forgetTab,
  isKeyFile,
  loadRec,
  loginName,
  makeKey,
  nameOf,
  offerSave,
  openKey,
  recallTab,
  rememberTab,
  saveRec,
  sealKey,
  setName,
  short8,
  signLine,
  supported,
  sweep,
  unb64
};
