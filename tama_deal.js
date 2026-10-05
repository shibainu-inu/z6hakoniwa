import * as tclk from "./hako_tclk.js";
import { notes, readTail } from "./tama_net.js";
import { pubFromDid } from "./hako_dot.js";
import { L } from "./tama_i18n.js";
import { jobId, tamaLine, parseTama, acceptKey, checkLines, lineStrict, mealPrompt, outPrompt, playPayoutAt, playBet, localDay, rewardOf, boxAt, outShape } from "./tama_core.js";
const dealKinds = [["meal", "\u3054\u306F\u3093"], ["out", "\u304A\u3067\u304B\u3051"], ["play", "\u3042\u305D\u3076"]];
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
async function acceptSigOk(did, key, text, sig) {
  try {
    const b = atob(String(sig ?? "").trim().replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(sig ?? "").trim().length / 4) * 4, "="));
    const pub = await crypto.subtle.importKey("raw", pubFromDid(did), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", pub, Uint8Array.from(b, (c) => c.charCodeAt(0)), new TextEncoder().encode(`tama-acc|${key}|${text}`));
  } catch {
    return false;
  }
}
class Deal {
  constructor({ kind, app, onEvent = () => {
  } }) {
    this.kind = kind;
    this.app = app;
    this.onEvent = onEvent;
    this.key = `tama_deal_v1:${app.did}:${kind}`;
    try {
      this.st = JSON.parse(localStorage.getItem(this.key) || "null");
    } catch {
      this.st = null;
    }
    this.rail = new tclk.PaperRail(notes);
  }
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.st));
    } catch {
    }
  }
  set(stage, extra = {}) {
    this.st = { ...this.st ?? {}, ...extra, stage };
    this.save();
    this.onEvent({ type: "stage", stage });
  }
  note(text) {
    this.onEvent({ type: "note", text });
  }
  busy() {
    return !!this.st && !this.st.done;
  }
  get box() {
    return this.app.box;
  }
  price() {
    return Number({ meal: boxAt(this.box, Date.now()).meal_price, out: boxAt(this.box, Date.now()).out_price, play: boxAt(this.box, Date.now()).play_stake, sit: boxAt(this.box, Date.now()).sit_price, sitplay: boxAt(this.box, Date.now()).sit_play_price }[this.kind]);
  }
  takers() {
    return new Set(this.kind === "play" ? this.box.npcs ?? [] : this.box.miners ?? []);
  }
  async context(st) {
    if (this.kind === "meal") return { v: 1, prompt: mealPrompt(this.box.meal_instruction, st) };
    if (this.kind === "play") return { v: 1 };
    let m = null;
    try {
      const r = await fetch(`moods.json?t=${Date.now()}`, { cache: "no-store" });
      if (r.ok) m = await r.json();
    } catch {
      m = null;
    }
    const facts = m?.twist ?? null;
    if (!facts) return null;
    return { v: 1, mood_version: m.version, hour: m.hour, facts, prompt: outPrompt(this.box.out_instruction, facts) };
  }
  async start({ st, ctx: given = null, deadlines = null, idMs = null }) {
    if (this.busy()) return { ok: false, why: L("\u3044\u307E\u306F\u53D6\u5F15\u306E\u9014\u4E2D\u3067\u3059", "A deal is already in progress") };
    const ctx = given ?? await this.context(st);
    if (!ctx) return { ok: false, why: L("\u9727\u3067\u8857\u304C\u3088\u304F\u898B\u3048\u307E\u305B\u3093\u3002\u5C11\u3057\u305F\u3063\u3066\u304B\u3089\u51FA\u304B\u3051\u3066\u307F\u3066\u304F\u3060\u3055\u3044", "The town is too foggy to see. Try going out a little later.") };
    const t = Date.now(), b = this.box;
    const dl = deadlines ?? { claimByMs: t + b.claim_by_min * 6e4, refundAfterMs: t + b.refund_after_min * 6e4 };
    const offer = tclk.makeOffer({
      from: this.app.did,
      role: "payer",
      lock: "hash",
      amount: String(this.price()),
      asset: "PAPER",
      rails: ["paper"],
      expiresMs: t + b.expires_min * 6e4,
      claimByMs: dl.claimByMs,
      refundAfterMs: dl.refundAfterMs,
      job: { proto: "tama", id: jobId(b, this.kind, this.app.did, idMs ?? t), context: JSON.stringify(ctx) }
    });
    this.st = { stage: "offering", kind: this.kind, offer, amount: this.price(), at: t, done: false };
    this.save();
    try {
      await this.app.signer.post(b.offers_room, tclk.encodeFrame(offer));
    } catch (e) {
      this.set("offer_failed", { done: true });
      return { ok: false, why: L(`\u6CE8\u6587\u3092\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`, `Couldn't place the order (${e.message})`) };
    }
    this.set("offered");
    return { ok: true };
  }
  async findAccept() {
    const key = acceptKey(this.app.did, this.kind, this.st.offer.id);
    const raw = await notes.get(this.box.accept_ns, key).catch(() => null);
    if (!raw) return null;
    const a = tclk.tryDecodeFrame(raw.trim());
    const o = this.st.offer;
    if (!a || a.type !== "accept" || a.ref !== o.id || !this.takers().has(a.from)) return null;
    if (this.box.accept_sig && !await acceptSigOk(a.from, key, raw.trim(), await notes.get(this.box.accept_ns, `${key}-sig`).catch(() => null))) return null;
    let want;
    try {
      want = tclk.contractId(o, { from: a.from, ref: a.ref, statement: a.statement, paymentKey: a.paymentKey, nonce: a.nonce });
    } catch {
      return null;
    }
    if (want !== a.contract) return null;
    const step = tclk.applyFrame(tclk.openContract(o), a, Math.min(Date.now(), o.expiresMs - 1));
    return step.ok ? { frame: a, state: step.state } : null;
  }
  async tick() {
    const st = this.st;
    if (!st || st.done) return;
    const now = Date.now(), o = st.offer, b = this.box;
    if (st.stage === "offering") {
      this.set("offer_failed", { done: true });
      return;
    }
    if (st.stage === "offered") {
      const a = await this.findAccept();
      if (!a) {
        if (now >= o.expiresMs) {
          this.set("no_taker", { done: true });
          this.note(L("\u76F8\u624B\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002PAPER \u306F\u52D5\u3044\u3066\u3044\u307E\u305B\u3093", "No taker was found. No PAPER moved."));
        }
        return;
      }
      const contract = a.frame.contract, room = tclk.dealRoom(contract);
      this.set("locking", { contract, room, payee: a.frame.from, accept: a.frame });
      const existing = await this.rail.read(contract).catch(() => null);
      const ref = existing ? contract : await this.rail.lock(tclk.lockTerms(a.state));
      const lock = { type: "lock", from: this.app.did, contract, rail: "paper", ref };
      this.set("locking", { lock });
      try {
        await this.app.signer.post(room, tclk.encodeFrame(lock), { gateUntilMs: o.claimByMs });
      } catch (e) {
        if (e.gate) {
          this.set("gate", { done: true });
          this.note(L("\u4F1A\u5834\u304C\u6DF7\u3093\u3067\u3044\u3066\u90E8\u5C4B\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002PAPER \u306F\u52D5\u3044\u3066\u3044\u307E\u305B\u3093", "The venue was too busy to open a room. No PAPER moved."));
          return;
        }
        this.note(e.status === 429 ? L("\u4F1A\u5834\u306E\u90E8\u5C4B\u306E\u6570\u304C\u4ECA\u65E5\u306E\u4E0A\u9650\u306B\u8FD1\u3044\u306E\u3067\u3001\u5C11\u3057\u5F85\u3063\u3066\u304B\u3089\u3082\u3046\u4E00\u5EA6\u958B\u304D\u307E\u3059", "The venue is near today's room limit, so it will try again in a moment.") : L(`\u90E8\u5C4B\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09\u3002\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u307E\u3059`, `Couldn't open a room (${e.message}). Trying again.`));
        return;
      }
      this.set("locked", { lock, locked: true, lockedAt: Date.now() });
      await this.app.signer.post(room, tamaLine({ t: "terms", offer: o, accept: a.frame }));
      await this.app.signer.post(b.board, tamaLine({ t: "deal", kind: this.kind, contract, n: rand() }));
      this.set("waiting");
      return;
    }
    if (st.stage === "locking") {
      if (now >= o.claimByMs) {
        this.set("gate", { done: true });
        this.note(L("\u4F1A\u5834\u304C\u6DF7\u3093\u3067\u3044\u3066\u90E8\u5C4B\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002PAPER \u306F\u52D5\u3044\u3066\u3044\u307E\u305B\u3093", "The venue was too busy to open a room. No PAPER moved."));
        return;
      }
      if (!st.lock) {
        let step = null;
        try {
          step = tclk.applyFrame(tclk.openContract(o), st.accept, Math.min(now, o.expiresMs - 1));
        } catch {
          step = null;
        }
        const existing = await this.rail.read(st.contract).catch(() => null);
        const ref = existing || !step?.ok ? st.contract : await this.rail.lock(tclk.lockTerms(step.state));
        this.set("locking", { lock: { type: "lock", from: this.app.did, contract: st.contract, rail: "paper", ref } });
      }
      try {
        await this.app.signer.post(st.room, tclk.encodeFrame(this.st.lock), { gateUntilMs: o.claimByMs });
      } catch (e) {
        this.note(e.status === 429 ? L("\u4F1A\u5834\u306E\u90E8\u5C4B\u306E\u6570\u304C\u4ECA\u65E5\u306E\u4E0A\u9650\u306B\u8FD1\u3044\u306E\u3067\u3001\u5C11\u3057\u5F85\u3063\u3066\u304B\u3089\u3082\u3046\u4E00\u5EA6\u958B\u304D\u307E\u3059", "The venue is near today's room limit, so it will try again in a moment.") : L(`\u90E8\u5C4B\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09\u3002\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u307E\u3059`, `Couldn't open a room (${e.message}). Trying again.`));
        return;
      }
      this.set("locked", { locked: true, lockedAt: st.lockedAt ?? Date.now() });
      return;
    }
    if (st.stage === "locked") {
      await this.app.signer.post(st.room, tamaLine({ t: "terms", offer: o, accept: st.accept }));
      await this.app.signer.post(b.board, tamaLine({ t: "deal", kind: this.kind, contract: st.contract, n: rand() }));
      this.set("waiting");
      return;
    }
    if (st.stage === "waiting") {
      const msgs = await readTail(st.room).catch(() => []);
      let lines = null, reveal = null;
      for (const m of msgs) {
        if (m.from !== st.payee) continue;
        const f = tclk.tryDecodeFrame(String(m.text ?? ""));
        if (f && f.type === "reveal" && f.contract === st.contract) {
          reveal = { f, ms: Date.parse(m.ts) };
          break;
        }
        const v = parseTama(m.text);
        if (v && v.t === "lines" && v.contract === st.contract && !lines) lines = v.lines;
        if (v && v.t === "giveup" && v.contract === st.contract && !st.gaveUp) {
          this.set("waiting", { gaveUp: true });
          this.note(this.kind === "out" ? L("\u4ECA\u65E5\u306F\u8A18\u4E8B\u304C\u3046\u307E\u304F\u66F8\u3051\u306A\u304B\u3063\u305F\u307F\u305F\u3044\u3002PAPER \u306F\u5C11\u3057\u305F\u3064\u3068\u623B\u308A\u307E\u3059", "The report didn't come out well today. The PAPER will come back shortly.") : L("\u3046\u307E\u304F\u4F5C\u308C\u306A\u304B\u3063\u305F\u307F\u305F\u3044\u3002PAPER \u306F\u5C11\u3057\u305F\u3064\u3068\u623B\u308A\u307E\u3059", "It didn't come out well. The PAPER will come back shortly."));
        }
      }
      if (reveal) return this.finish(lines, reveal.ms, reveal.f.secret);
      if (now >= o.refundAfterMs) {
        const ref = st.lock?.ref ?? st.contract;
        try {
          await this.rail.refund(ref);
        } catch {
        }
        await this.app.signer.post(st.room, tclk.encodeFrame({ type: "refund", from: this.app.did, contract: st.contract, ref }));
        this.set("refunded", { done: true, locked: false });
        this.note(L("\u671F\u9650\u307E\u3067\u306B\u5C4A\u304B\u306A\u304B\u3063\u305F\u306E\u3067\u3001PAPER \u3092\u623B\u3057\u307E\u3057\u305F", "It didn't arrive in time, so the PAPER was returned."));
      }
    }
  }
  async finish(lines, ms, secret) {
    const b = this.box, st = this.st;
    let ok = true, say = "";
    if (this.kind === "sitplay") ok = checkLines(lines, { n: Number(b.meal_lines), maxChars: b.line_max_chars, instruction: b.sit_play_instruction, fragmentWords: b.fragment_words, strict: lineStrict(b, this.st?.lockedAt ?? Date.now()) }).ok;
    if (this.kind === "meal" || this.kind === "sit") ok = checkLines(lines, { n: Number(b.meal_lines), maxChars: b.line_max_chars, instruction: b.meal_instruction, fragmentWords: b.fragment_words, strict: lineStrict(b, this.st?.lockedAt ?? Date.now()) }).ok;
    if (this.kind === "out") {
      const sh = outShape(b, st.offer?.job?.context);
      ok = checkLines(lines, { n: sh.n, maxChars: b.line_max_chars, instruction: sh.instruction, fragmentWords: b.fragment_words, needs: sh.needs, digitsOk: false, strict: lineStrict(b, this.st?.lockedAt ?? Date.now()) }).ok;
    }
    if (!ok) {
      this.set("ng", { done: true, locked: false, lines });
      this.note(L("\u5C4A\u3044\u305F\u3082\u306E\u304C\u6C7A\u307E\u308A\u306B\u5408\u308F\u306A\u304B\u3063\u305F\u306E\u3067\u3001\u6210\u7ACB\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002PAPER \u306F\u52D5\u3044\u3066\u3044\u307E\u305B\u3093", "What arrived didn't meet the rules, so the deal didn't settle. No PAPER moved."));
      return;
    }
    let delta = -Number(st.amount);
    if (this.kind === "play" && !playBet(boxAt(b, st.at ?? ms))) {
      const who = `HAKO \u2026${String(st.payee ?? "").slice(-4)}`;
      say = L(`${who} \u3068\u3042\u305D\u3073\u307E\u3057\u305F`, `Played with ${who}`);
    } else if (this.kind === "play") {
      const back = await playPayoutAt(b, st.at, st.contract, secret);
      delta += back;
      say = back > st.amount ? L(`\u52DD\u3063\u305F\uFF01 ${back} $PAPER \u623B\u3063\u3066\u304D\u305F`, `You won! ${back} $PAPER came back`) : back === st.amount ? L(`\u5F15\u304D\u5206\u3051\u3002${back} $PAPER \u623B\u3063\u3066\u304D\u305F`, `A draw. ${back} $PAPER came back`) : L(`\u8CA0\u3051\u3061\u3083\u3063\u305F\u3002${back} $PAPER \u3060\u3051\u623B\u3063\u3066\u304D\u305F`, `You lost. Only ${back} $PAPER came back`);
    }
    if (this.kind === "meal" || this.kind === "sit" || this.kind === "sitplay") say = lines?.[0] ?? "";
    if (this.kind === "out") {
      const nth = (this.app.st?.outsToday ?? 0) + 1;
      const r = rewardOf(boxAt(b, st.at ?? ms), nth);
      say = r > 0 ? L(`\u8A18\u4E8B\u304C\u3067\u304D\u307E\u3057\u305F\u3002\u307B\u3046\u3073 ${r} $PAPER\uFF08\u4ECA\u65E5 ${nth} \u56DE\u76EE\uFF09\u306F\u3001\u5E33\u7C3F\u4FC2\u304C\u78BA\u304B\u3081\u3066\u304B\u3089\u5C4A\u304D\u307E\u3059`, `The report is done. The reward of ${r} $PAPER (outing #${nth} today) arrives after the ledger keeper checks it.`) : L("\u8A18\u4E8B\u304C\u3067\u304D\u307E\u3057\u305F", "The report is ready");
    }
    this.set("settled", { done: true, locked: false, lines, settledAt: ms, day: localDay(ms, b) });
    this.onEvent({ type: "settled", contract: st.contract, ms, delta, say, lines });
  }
}
const slotKind = (slot) => /-p\d+$/.test(String(slot)) ? "sitplay" : "sit";
class SitDeal extends Deal {
  constructor({ app, slot, onEvent }) {
    super({ kind: slotKind(slot), app, onEvent });
    this.slot = slot;
    this.key = `tama_deal_v1:${app.did}:sit:${slot}`;
    try {
      this.st = JSON.parse(localStorage.getItem(this.key) || "null");
    } catch {
      this.st = null;
    }
  }
  at() {
    try {
      return Number(JSON.parse(this.st.offer.job.context).at);
    } catch {
      return 0;
    }
  }
  book({ st, plan, t0 }) {
    const ins = this.kind === "sitplay" ? this.box.sit_play_instruction : this.box.meal_instruction;
    return this.start({
      st,
      ctx: { v: 1, prompt: mealPrompt(ins, st), at: plan.at },
      deadlines: { claimByMs: plan.claimByMs, refundAfterMs: plan.refundAfterMs },
      idMs: t0 + (plan.j ? 10 * plan.k + plan.j : plan.k)
    });
  }
  async tick() {
    if (this.st?.stage === "waiting" && Date.now() < this.at()) return;
    return super.tick();
  }
}
export {
  Deal,
  SitDeal,
  dealKinds,
  slotKind
};
