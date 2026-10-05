const enc = new TextEncoder();
const PKCS8_HEAD = "302e020100300506032b657004220420";
const WRAP_MAX = 1024;
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "=".repeat((4 - t.length % 4) % 4)), (c) => c.charCodeAt(0));
};
const cat = (...xs) => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of xs) {
    out.set(x, i);
    i += x.length;
  }
  return out;
};
async function kidOf(pubRaw) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", pubRaw)).slice(0, 8));
}
const wrapInfo = (room, kid, agentDid, ownerDid) => `hakoniwa/tama-wrap/v1|${room}|${kid}|${agentDid}|${ownerDid}`;
async function aesKey(priv, peerPub, epkRaw, sitterRaw, info) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPub }, priv, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: cat(epkRaw, sitterRaw), info: enc.encode(info) }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function wrapKey(pkcs8, sitterRaw, { room, agentDid, ownerDid }) {
  if (!(pkcs8 instanceof Uint8Array) || pkcs8.length !== 48 || hex(pkcs8.slice(0, 16)) !== PKCS8_HEAD) throw new Error("pkcs8 form");
  const kid = await kidOf(sitterRaw), info = wrapInfo(room, kid, agentDid, ownerDid);
  const sitterPub = await crypto.subtle.importKey("raw", sitterRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(eph.privateKey, sitterPub, epk, sitterRaw, info);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(info) }, key, pkcs8));
  return { v: 1, kid, epk: b64u(epk), iv: b64u(iv), ct: b64u(ct) };
}
async function unwrapKey(wrap, sitterPriv, sitterRaw, { room, agentDid, ownerDid, agentPubRaw }) {
  if (!wrap || typeof wrap !== "object" || wrap.v !== 1 || JSON.stringify(wrap).length > WRAP_MAX) throw new Error("wrap form");
  const kid = await kidOf(sitterRaw);
  if (wrap.kid !== kid) throw new Error("wrap kid");
  const epk = unb64u(wrap.epk), iv = unb64u(wrap.iv), ct = unb64u(wrap.ct);
  if (epk.length !== 65 || epk[0] !== 4 || iv.length !== 12 || ct.length !== 64) throw new Error("wrap sizes");
  const info = wrapInfo(room, kid, agentDid, ownerDid);
  const epub = await crypto.subtle.importKey("raw", epk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const key = await aesKey(sitterPriv, epub, epk, sitterRaw, info);
  const pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(info) }, key, ct));
  if (pkcs8.length !== 48 || hex(pkcs8.slice(0, 16)) !== PKCS8_HEAD) throw new Error("pkcs8 form");
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  const probe = enc.encode(`tama-wrap-probe|${info}`);
  const sig = await crypto.subtle.sign("Ed25519", priv, probe);
  const pub = await crypto.subtle.importKey("raw", agentPubRaw, { name: "Ed25519" }, false, ["verify"]);
  if (!await crypto.subtle.verify("Ed25519", pub, sig, probe)) throw new Error("key does not match agent did");
  return priv;
}
export {
  WRAP_MAX,
  kidOf,
  unwrapKey,
  wrapInfo,
  wrapKey
};
