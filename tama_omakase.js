import { tamaLine } from "./tama_core.js";
import { didOf } from "./tama_key.js";
import { wrapKey, kidOf } from "./tama_wrap.js";
const enc = new TextEncoder();
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "=".repeat((4 - t.length % 4) % 4)), (c) => c.charCodeAt(0));
};
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
const DAY = 24 * 36e5;
function capDay(box) {
  const plays = Number(box.sitter_play_per_day ?? 1), outs = Number(box.sitter_out_per_day ?? 0);
  const meals = Math.ceil((24 * Number(box.hunger_per_hour) + plays * Number(box.play_hunger ?? 0) + outs * Number(box.out_hunger ?? 0)) / Number(box.meal_fill));
  return meals * Number(box.meal_price) + plays * Number(box.play_stake) + outs * Number(box.out_price);
}
const maxDays = (box) => Number(box.delegate_max_days ?? 10);
const available = (box) => typeof box?.sitter_pub === "string" && box.sitter_pub.length > 80;
const sealMsg = (ownerDid, agentDid) => `hakoniwa/tama-agent-seal/v1|${ownerDid}|${agentDid}`;
async function sealAes(ownerPriv, ownerDid, agentDid) {
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", ownerPriv, enc.encode(sealMsg(ownerDid, agentDid))));
  const hk = await crypto.subtle.importKey("raw", sig, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(sealMsg(ownerDid, agentDid)) }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealAgent(ownerPriv, ownerDid, agentDid, pkcs8) {
  const m = enc.encode(sealMsg(ownerDid, agentDid)), s1 = new Uint8Array(await crypto.subtle.sign("Ed25519", ownerPriv, m)), s2 = new Uint8Array(await crypto.subtle.sign("Ed25519", ownerPriv, m));
  if (s1.length !== s2.length || s1.some((x, i) => x !== s2[i])) throw new Error("signature not deterministic");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(sealMsg(ownerDid, agentDid)) }, await sealAes(ownerPriv, ownerDid, agentDid), pkcs8));
  return { v: 1, did: agentDid, iv: b64u(iv), ct: b64u(ct) };
}
async function openAgent(ownerPriv, ownerDid, sealed) {
  const pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(sealed.iv), additionalData: enc.encode(sealMsg(ownerDid, sealed.did)) }, await sealAes(ownerPriv, ownerDid, sealed.did), unb64u(sealed.ct)));
  const priv = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  if (didOf(unb64u(jwk.x)) !== sealed.did) throw new Error("agent key does not match did");
  return { priv, pkcs8 };
}
async function newAgent() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const did = didOf(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  return { did, priv: kp.privateKey, pkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)) };
}
const OKEY = (did) => `tama_omakase_v1:${did}`;
function loadPlan(did) {
  try {
    const j = JSON.parse(localStorage.getItem(OKEY(did)) || "null");
    return j && typeof j === "object" && typeof j.agent === "string" ? j : null;
  } catch {
    return null;
  }
}
function savePlan(did, p) {
  try {
    if (p) localStorage.setItem(OKEY(did), JSON.stringify(p));
    else localStorage.removeItem(OKEY(did));
  } catch {
  }
}
function liveGrants(delegates, ownerDid, now) {
  return Object.entries(delegates ?? {}).filter(([, g]) => g && g.owner === ownerDid && Number(g.until) > now).map(([agent, g]) => ({ agent, since: g.since, until: g.until, cap: g.cap }));
}
function status({ plan, delegates, ownerDid, ledgerMs, now }) {
  const live = liveGrants(delegates, ownerDid, now);
  if (plan && plan.step !== "done") return { mode: "starting", agent: plan.agent, until: plan.until, cap: plan.cap, stop: plan.stop === true };
  if (plan && plan.step === "done" && Number(plan.at) > ledgerMs) {
    return plan.until > now ? { mode: "on", agent: plan.agent, until: plan.until, cap: plan.cap } : { mode: "off" };
  }
  const g = live.sort((a, b) => b.since - a.since)[0];
  return g ? { mode: "on", agent: g.agent, until: g.until, cap: g.cap } : { mode: "off" };
}
async function run(ctx, want) {
  const { box, ownerDid, ownerPriv } = ctx;
  const kid = await kidOf(unb64u(box.sitter_pub));
  const live = liveGrants(ctx.delegates, ownerDid, ctx.now).map((g) => g.agent);
  let plan = loadPlan(ownerDid);
  if (plan && plan.step === "done") plan = null;
  if (!plan && !want.stop && !Number.isFinite(Number(want.days))) return { ok: false, why: "nothing to resume" };
  if (want.stop) {
    const st = status({ plan: loadPlan(ownerDid), delegates: ctx.delegates, ownerDid, ledgerMs: ctx.ledgerMs ?? 0, now: ctx.now });
    const all = [...new Set([...st.agent ? [st.agent] : [], ...plan?.agent ? [plan.agent] : [], ...live])];
    if (!all.length) {
      savePlan(ownerDid, null);
      return { ok: false, why: "not delegated" };
    }
    plan = { stop: true, agent: all[0], until: 0, cap: 0, revoke: all, step: "revoke" };
  } else if (want.days != null) {
    const days = Math.min(Math.max(1, Math.floor(Number(want.days))), maxDays(box));
    const rec = ctx.loadRec();
    const keep = rec?.agent && typeof rec.agent.did === "string" ? rec.agent.did : null;
    const on = status({ plan: loadPlan(ownerDid), delegates: ctx.delegates, ownerDid, ledgerMs: ctx.ledgerMs ?? 0, now: ctx.now });
    const same = keep && on.mode === "on" && on.agent === keep && rec.agentOk === kid;
    plan = { days, cap: capDay(box), agent: keep, step: !keep ? "key" : same ? "delegate" : "ok", revoke: live.filter((a) => a !== keep) };
  }
  savePlan(ownerDid, plan);
  const owner = ctx.signerOf(ownerDid, ownerPriv);
  const saveRec = (mut) => {
    const r = ctx.loadRec();
    if (!r || r.did !== ownerDid) throw new Error("key record changed");
    mut(r);
    if (!ctx.saveRec(r)) throw new Error("save");
    return r;
  };
  try {
    if (plan.step === "key") {
      const a = await newAgent();
      const sealed = await sealAgent(ownerPriv, ownerDid, a.did, a.pkcs8);
      saveRec((r) => {
        r.agent = sealed;
        delete r.agentOk;
      });
      plan.agent = a.did;
      plan.step = "ok";
      savePlan(ownerDid, plan);
    }
    for (const a of [...plan.revoke ?? []]) {
      await ctx.post(owner, box.board, tamaLine({ t: "delegate", v: 1, to: a, until: 0, cap_day: 0, n: rand() }));
      plan.revoke = plan.revoke.filter((x) => x !== a);
      savePlan(ownerDid, plan);
    }
    if (plan.stop) {
      plan.step = "done";
      plan.at = Date.now();
      savePlan(ownerDid, plan);
      return { ok: true, plan };
    }
    const rec = ctx.loadRec();
    if (plan.step === "delegate" && rec?.agentOk !== kid) plan.step = "ok";
    if (plan.step === "ok") {
      const { priv, pkcs8 } = await openAgent(ownerPriv, ownerDid, rec.agent);
      const wrap = await wrapKey(pkcs8, unb64u(box.sitter_pub), { room: box.board, agentDid: rec.agent.did, ownerDid });
      await ctx.post(ctx.signerOf(rec.agent.did, priv), box.board, tamaLine({ t: "delegate_ok", v: 1, owner: ownerDid, wrap, n: rand() }));
      saveRec((r) => {
        r.agentOk = wrap.kid;
      });
      plan.step = "delegate";
      savePlan(ownerDid, plan);
    }
    if (plan.step === "delegate") {
      plan.until = Date.now() + Math.min(Math.max(1, Math.floor(Number(plan.days) || 1)), maxDays(box)) * DAY - 30 * 6e4;
      await ctx.post(owner, box.board, tamaLine({ t: "delegate", v: 1, to: plan.agent, until: plan.until, cap_day: plan.cap, n: rand() }));
      plan.step = "done";
      plan.at = Date.now();
      savePlan(ownerDid, plan);
    }
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, plan, why: String(e?.message ?? e) };
  }
}
const abandon = (ownerDid) => savePlan(ownerDid, null);
export {
  abandon,
  available,
  capDay,
  liveGrants,
  loadPlan,
  maxDays,
  newAgent,
  openAgent,
  run,
  savePlan,
  sealAgent,
  status
};
