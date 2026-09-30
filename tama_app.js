import { lifeState, localDay, tamaLine, fillArticle, rewardOf } from "./tama_core.js";
import { spriteSvg, spriteRows } from "./tama_sprite.js";
import { setVenue, makeSigner, readTail } from "./tama_net.js";
import * as K from "./tama_key.js";
import { Deal, dealKinds } from "./tama_deal.js";
import { lifetime, unlocked, nextUnlock, whenText, roomSvg, artSvg, frameSvg, scrapSvg, svgToPng, spot, HAKO_PX } from "./tama_room.js";
import { renderGarden } from "./tama_garden.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(Number(n)).toLocaleString("ja-JP");
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
const app = { stats: null, box: null, did: null, priv: null, signer: null, motion: null, deals: {} };
const LKEY = (did) => `tama_local_v1:${did}`;
function loadLocal(did) {
  try {
    const j = JSON.parse(localStorage.getItem(LKEY(did)) || "null");
    return j && typeof j === "object" ? j : { events: [], deltas: [] };
  } catch {
    return { events: [], deltas: [] };
  }
}
function saveLocal(did, j) {
  try {
    localStorage.setItem(LKEY(did), JSON.stringify(j));
  } catch {
  }
}
function addLocal(did, ev, delta = 0) {
  const j = loadLocal(did);
  if (!j.events.some((e) => e.t === ev.t && (ev.contract ? e.contract === ev.contract : e.ms === ev.ms))) {
    j.events.push(ev);
    if (delta) j.deltas.push({ key: ev.contract ?? `${ev.t}-${ev.ms}`, ms: ev.ms, delta });
  }
  saveLocal(did, j);
}
function merged(stats, did) {
  const d = stats?.did?.[did];
  const genMs = Number(stats?.box?.now_ms ?? 0);
  const foldEv = d?.events ?? [];
  const has = (e) => foldEv.some((f) => f.t === e.t && (e.contract ? f.contract === e.contract : e.t === "join" ? true : Math.abs(f.ms - e.ms) < 12e4));
  const loc = loadLocal(did);
  const keep = loc.events.filter((e) => !has(e) && (e.ms > genMs - 3 * 36e5 || !d));
  const keys = new Set(keep.map((e) => e.contract ?? `${e.t}-${e.ms}`));
  let balance = d ? Number(d.balance) : 0;
  for (const x of loc.deltas) if (keys.has(x.key)) balance += x.delta;
  if (!d && keep.some((e) => e.t === "join")) balance += Number(app.box.initial_paper);
  for (const x of Object.values(app.deals)) if (x.st?.locked && !x.st?.done) balance -= Number(x.st.amount ?? 0);
  return { events: [...foldEv, ...keep], balance, fromFold: !!d, fold: d ?? null };
}
const FRAMES = {
  normal: [{}],
  eat: [{ mouth: "open" }, { mouth: "small" }],
  happy: [{ eye: "smiley", mouth: "open" }, { eye: "smiley", mouth: "smile" }],
  sad: [{ eye: "sleepy", mouth: "flat" }]
};
const SHOW = ["type", "t", "kind", "amount", "asset", "rail", "contract"];
const short = (x) => String(x).length > 14 ? `${String(x).slice(0, 6)}\u2026${String(x).slice(-4)}` : String(x);
function opLine(room, text) {
  const sp = String(text).indexOf(" "), proto = sp > 0 ? String(text).slice(0, sp) : "post";
  let o = null;
  try {
    o = JSON.parse(String(text).slice(sp + 1));
  } catch {
    o = null;
  }
  const parts = [];
  if (o && typeof o === "object") {
    const pick = Object.fromEntries(SHOW.filter((k) => o[k] != null).map((k) => [k, o[k]]));
    parts.push(String(pick.type ?? pick.t ?? "line"));
    if (pick.kind) parts.push(String(pick.kind));
    if (pick.amount) parts.push(`${pick.amount} ${pick.asset ?? ""}`.trim());
    if (pick.rail) parts.push(String(pick.rail));
    if (pick.contract) parts.push(short(pick.contract));
  }
  return `${proto} ${parts.join(" \xB7 ")} \u2192 /r/${String(room).length > 22 ? String(room).slice(0, 21) + "\u2026" : room}`;
}
function logOp(line) {
  app.ops = [...app.ops ?? [], { line, at: Date.now() }].slice(-3);
  const el = $("ops");
  if (el) el.innerHTML = opsHtml();
}
const opsHtml = () => (app.ops ?? []).map((x) => `<span class="${Date.now() - x.at > 12e3 ? "old" : ""}">\u203A ${esc(x.line)}</span>`).join("");
function watched(signer) {
  const post = signer.post.bind(signer);
  signer.post = async (room, text, opts) => {
    logOp(opLine(room, text));
    return post(room, text, opts);
  };
  return signer;
}
const WAIT = { offering: [0, "\u76F8\u624B\u3092\u63A2\u3057\u3066\u3044\u307E\u3059"], offered: [0, "\u76F8\u624B\u3092\u63A2\u3057\u3066\u3044\u307E\u3059"], locking: [1, "PAPER \u3092\u9810\u3051\u3066\u3044\u307E\u3059"], locked: [2, "\u5C4A\u304F\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059"], waiting: [2, "\u5C4A\u304F\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059"] };
function waitHtml() {
  const live2 = (x2) => x2.st && !x2.st.done;
  const x = Object.values(app.deals).find((d) => live2(d) && d.st.locked) ?? Object.values(app.deals).find(live2);
  if (!x) return "";
  const [step, label] = x.st.gaveUp ? [2, "PAPER \u304C\u623B\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059"] : WAIT[x.st.stage] ?? [2, "\u5C4A\u304F\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059"];
  return `<div class="wait" role="status"><span class="track" style="--s:${step}">${[0, 1, 2].map((k) => `<i class="${k < step ? "done" : k === step ? "now" : ""}"></i>`).join("")}<b class="coin"></b></span><span>${label}</span><span class="dots"><i></i><i></i><i></i></span></div>`;
}
let timer = null, live = 0;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function pink() {
  let n = 0;
  const v = [0, 0, 0, 0];
  return () => {
    n += 1;
    for (let k = 0; k < 4; k++) if (n % (1 << k) === 0 || n === 1) v[k] = Math.random() * 2 - 1;
    return (v[0] + v[1] + v[2] + v[3]) / 4;
  };
}
const SINE = "cubic-bezier(.37,0,.63,1)";
function hopOnce(fig, shadow, h) {
  const up = `translateY(${-h * 100}%)`;
  const a = fig.animate([
    { transform: "translateY(0) scale(1,1)", easing: "cubic-bezier(.3,0,.6,1)" },
    { offset: 0.2, transform: "translateY(0) scale(1.06,.93)", easing: "cubic-bezier(.2,.7,.4,1)" },
    // 予備動作
    { offset: 0.52, transform: `${up} scale(.97,1.04)`, easing: "cubic-bezier(.6,0,.85,.4)" },
    // 頂点（上りは減速、下りは加速）
    { offset: 0.76, transform: "translateY(0) scale(1.08,.91)", easing: "cubic-bezier(.3,.6,.4,1)" },
    // 着地のつぶれ
    { offset: 0.9, transform: "translateY(0) scale(.985,1.02)", easing: SINE },
    // 余韻
    { transform: "translateY(0) scale(1,1)" }
  ], { duration: 1150 });
  shadow?.animate([
    { transform: "scaleX(1)", opacity: 1 },
    { offset: 0.2, transform: "scaleX(1.06)", opacity: 1 },
    { offset: 0.52, transform: `scaleX(${1 - h * 1.6})`, opacity: 0.5 },
    { offset: 0.76, transform: "scaleX(1.08)", opacity: 1 },
    { transform: "scaleX(1)", opacity: 1 }
  ], { duration: 1150 });
  return a.finished.catch(() => {
  });
}
function idle(fig, shadow, happy) {
  const my = live, noise = pink();
  let untilHop = happy ? 1 : 4 + Math.floor(Math.random() * 4);
  const breath = () => {
    if (my !== live || !fig.isConnected) return;
    const dur = (happy ? 1600 : 5e3) * (1 + 0.18 * noise()), amp = 0.028 * (1 + 0.35 * noise());
    const a = fig.animate([{ transform: "scale(1,1)", easing: SINE }, { offset: 0.4, transform: `scale(${1 - amp * 0.8},${1 + amp})`, easing: SINE }, { transform: "scale(1,1)" }], { duration: dur });
    shadow?.animate([{ transform: "scaleX(1)", opacity: 1 }, { offset: 0.4, transform: "scaleX(.96)", opacity: 0.85 }, { transform: "scaleX(1)", opacity: 1 }], { duration: dur });
    a.finished.then(() => {
      if (my !== live) return;
      untilHop -= 1;
      if (untilHop > 0) return breath();
      untilHop = happy ? 1 : 3 + Math.floor(Math.random() * 5);
      hopOnce(fig, shadow, happy ? 0.24 : 0.12).then(breath);
    }).catch(() => {
    });
  };
  breath();
}
function setMotion(kind) {
  const stage = $("stage"), slot = $("slot");
  if (!stage || !slot) return;
  if (app.motion === kind && slot.firstChild) return;
  app.motion = kind;
  clearTimeout(timer);
  timer = null;
  live += 1;
  const grow = app.st?.stage ?? "egg";
  stage.className = `stage m-${kind} s-${grow}`;
  const at = (rows, k) => {
    const p = spot(rows, k);
    return `left:${p.left}%;bottom:${p.bottom}%;width:${p.width}%`;
  };
  if (kind === "grave") {
    slot.innerHTML = `<div class="pos" style="${at(spriteRows(app.did, "ghost")[0], "ghost")}"><div class="ghost">${spriteSvg(app.did, "ghost", HAKO_PX)}</div></div>`;
    return;
  }
  if (kind === "out") {
    slot.innerHTML = `<div class="away">${outSign()}<p>\u304A\u3067\u304B\u3051\u4E2D</p></div>`;
    return;
  }
  const look = kind === "reborn" ? "egg" : grow;
  const fx = kind === "happy" ? `<span class="fx"><i></i><i></i><i></i></span>` : kind === "eat" ? `${bowl()}<span class="fx steam"><i></i><i></i></span>` : kind === "sad" && look === "hako" ? `<span class="fx drop"><i></i></span>` : "";
  slot.innerHTML = `<div class="pos" style="${at(spriteRows(app.did, look)[0])}"><div class="shadow"></div><div class="hako"></div>${fx}</div>`;
  const fig = slot.querySelector(".hako"), shadow = slot.querySelector(".shadow");
  const frames = FRAMES[kind] ?? FRAMES.normal;
  const show = (f) => {
    fig.innerHTML = spriteSvg(app.did, look, HAKO_PX, f);
  };
  show(frames[0]);
  const my = live;
  if ((kind === "normal" || kind === "happy") && look !== "egg" && !calm() && fig.animate) idle(fig, shadow, kind === "happy");
  if (look !== "hako" || calm()) return;
  if (kind === "normal") {
    const blink = (again) => {
      timer = setTimeout(() => {
        if (my !== live) return;
        show({ eye: "line" });
        timer = setTimeout(() => {
          if (my !== live) return;
          show({});
          blink(!again && Math.random() < 0.2);
        }, 160);
      }, again ? 220 : 2200 + Math.random() * 3800);
    };
    blink(false);
  } else if (frames.length > 1) {
    let i = 0;
    const step = () => {
      timer = setTimeout(() => {
        if (my !== live) return;
        i += 1;
        show(frames[i % frames.length]);
        step();
      }, 900);
    };
    step();
  }
}
const ITEM_PAL = { k: "ink", w: "#d9b48a", d: "#a87f59", o: "#f5a06e", c: "#fffdf8", y: "#f2cf6b" };
const BOWL = ["    kkkkkk    ", "  kkcccccckk  ", "kkkkkkkkkkkkkk", "kooooooooooook", "kooyyyyyyyyook", " kooooooooook ", "  kooooooook  ", "   kkkkkkkk   "];
const SIGN = ["  kkkkkkkkkkk   ", "  kwwwwwwwwwkk  ", "  kwwwwwwwwwwwk ", "  kwwwwwwwwwkk  ", "  kkkkkkkkkkk   ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "     kkkkk      "];
const bowl = () => artSvg(BOWL, ITEM_PAL, "css", "bowl");
const outSign = () => artSvg(SIGN, ITEM_PAL, "css", "sign");
function meter(label, v, max) {
  const n = Math.round(Number(v) / Number(max) * 10), cls = n >= 6 ? "good" : n >= 3 ? "mid" : "bad";
  return `<div class="meter"><div class="row"><span>${label}</span><span class="mono dim">${Math.round(v)}/${max}</span></div><div class="bar ${cls}" role="meter" aria-valuenow="${Math.round(v)}" aria-valuemax="${max}" aria-label="${label}">${Array.from({ length: 10 }, (_, k) => `<i class="${k < n ? "on" : ""}" style="--k:${k}"></i>`).join("")}</div></div>`;
}
const DOT = { meal: "var(--meal)", out: "var(--out)", play: "var(--play)" };
function stateWord(st) {
  const k = motionOf(st);
  return { grave: "\u304A\u5893", out: "\u304A\u3067\u304B\u3051\u4E2D", eat: "\u98DF\u4E8B\u4E2D", happy: "\u3054\u304D\u3052\u3093", sad: "\u3057\u3087\u3093\u307C\u308A", reborn: "\u751F\u307E\u308C\u5909\u308F\u308A" }[k] ?? (st.hunger >= 60 ? "\u3052\u3093\u304D" : "\u3075\u3064\u3046");
}
function lastSay(fold) {
  if (app.lastSay) return app.lastSay;
  const meals = fold?.meals ?? [];
  return meals.length ? meals[meals.length - 1].line : null;
}
function motionOf(st) {
  if (!st.born) return "normal";
  if (app.rebornUntil && Date.now() < app.rebornUntil) return "reborn";
  if (st.grave) return "grave";
  const live2 = (x) => x.st && !x.st.done && !x.st.gaveUp;
  const busy = Object.values(app.deals).find((x) => live2(x) && x.st.locked) ?? Object.values(app.deals).find(live2);
  if (busy?.kind === "meal") return "eat";
  if (busy?.kind === "out") return "out";
  if (app.happyUntil && Date.now() < app.happyUntil) return "happy";
  if (st.hunger < 25 || st.mood < 20) return "sad";
  return "normal";
}
function render() {
  const view = $("view");
  renderChrome();
  if (!app.did) return renderEgg();
  if (!app.priv) return renderUnlock();
  const m = merged(app.stats, app.did);
  const st = lifeState(m.events, Date.now(), app.box);
  app.st = st;
  app.balance = m.balance;
  if (!st.born) return renderEgg();
  const fee = Number(app.box.reborn_price ?? 0);
  const graveNote = st.grave ? `<p class="note">\u304A\u306A\u304B\u304C\u7A7A\u3063\u307D\u306E\u307E\u307E ${app.box.grave_after_hours} \u6642\u9593\u304C\u305F\u3063\u3066\u3001\u304A\u5893\u306B\u306A\u308A\u307E\u3057\u305F\u3002\u751F\u307E\u308C\u5909\u308F\u308B\u3068\u3001\u540C\u3058 HAKO \u304C\u3082\u3046\u4E00\u5EA6\u306F\u3058\u3081\u304B\u3089\u3084\u308A\u76F4\u3057\u307E\u3059\uFF08\u90E8\u5C4B\u3068\u3053\u308C\u307E\u3067\u306E\u8A18\u9332\u306F\u305D\u306E\u307E\u307E\uFF09\u3002\u751F\u307E\u308C\u5909\u308F\u308A\u306B\u306F ${fmt(fee)} $PAPER \u304B\u304B\u308A\u307E\u3059${m.balance < fee ? `\uFF08\u3044\u307E\u306F\u8DB3\u308A\u306A\u3044\u306E\u3067\u3001\u8CA1\u5E03\u304C 0 \u306B\u306A\u3063\u3066\u751F\u307E\u308C\u5909\u308F\u308A\u307E\u3059\uFF09` : ""}\u3002\u304A\u5893\u306E\u9593\u306F\u3001\u304A\u3067\u304B\u3051\u3068\u3042\u305D\u3076\u306F\u3067\u304D\u307E\u305B\u3093\u3002</p>` : "";
  const said = st.grave ? null : lastSay(m.fold);
  const w = $("wallet");
  if (w) {
    w.hidden = false;
    w.textContent = `${fmt(m.balance)} $PAPER${m.fromFold ? "" : " *"}`;
    w.title = m.fromFold ? "\u8CA1\u5E03" : "\u5E33\u7C3F\u306B\u8F09\u308B\u307E\u3067\u306E\u898B\u8FBC\u307F";
  }
  const acts = actionsHtml(st, m);
  view.innerHTML = `
    <section class="card" id="me">
      <div id="stage" class="stage"><div class="bg">${roomBg(m, st)}</div>${said ? `<div class="say">${esc(said)}</div>` : ""}<div id="slot"></div><div class="ops mono" id="ops" aria-hidden="true">${opsHtml()}</div></div>
      ${waitHtml()}
      <div class="who"><span class="name">HAKO <span class="mono">${esc(app.did.slice(-8))}</span></span><span class="chip state"><span class="dot" style="background:${st.grave ? "var(--dim)" : st.hunger >= 60 ? "var(--good)" : st.hunger >= 30 ? "var(--mid)" : "var(--bad)"}"></span>${stateWord(st)}</span></div>
      ${st.grave ? "" : `<div class="meters">${meter("\u304A\u306A\u304B", st.hunger, app.box.hunger_max)}${meter("\u3054\u304D\u3052\u3093", st.mood, app.box.mood_max)}</div>`}
      <div class="chips mono">
        <span class="chip">\u9023\u7D9A ${st.streak} \u65E5</span>
        ${st.grave ? "" : `<span class="chip">\u304A\u3067\u304B\u3051 ${st.outsToday}/${app.box.out_per_day}</span><span class="chip">\u3042\u305D\u3076 ${playsToday(m)}/${app.box.play_per_day}</span>`}
        ${st.rebirths ? `<span class="chip">\u751F\u307E\u308C\u5909\u308F\u308A ${st.rebirths}</span>` : ""}
        ${m.fromFold ? "" : `<span class="chip">* \u5E33\u7C3F\u306B\u8F09\u308B\u307E\u3067\u306E\u898B\u8FBC\u307F</span>`}
      </div>
      ${!st.grave && st.stage !== "hako" && app.box.grow_hours ? `<p class="hint">${Math.round(app.box.grow_hours / 24)} \u65E5\u80B2\u3066\u308B\u3068\u2026\uFF1F</p>` : ""}
      ${graveNote}
      <div class="actions main">${acts}</div>
      <p id="why" class="why">${esc(app.why ?? "")}</p>
      <div id="said"></div>
      ${roomInfo(m, st)}
    </section>`;
  app.motion = null;
  setMotion(motionOf(st));
  for (const b of document.querySelectorAll("#reborn")) b.onclick = reborn;
  const cam = $("snapshot");
  if (cam) cam.onclick = () => snapshot(m, st);
  for (const b of document.querySelectorAll("button[data-kind]")) b.onclick = () => startDeal(b.dataset.kind);
  renderSaid(m.fold);
}
function actionsHtml(st, m) {
  if (st.grave) return `<button class="btn" id="reborn" style="--c:var(--accent)"><span class="dot" style="background:var(--accent)"></span>\u751F\u307E\u308C\u5909\u308F\u308B <span class="price">${fmt(Math.min(Number(app.box.reborn_price ?? 0), Math.max(0, m.balance)))} $PAPER</span></button>`;
  const price = { meal: app.box.meal_price, out: app.box.out_price, play: app.box.play_stake };
  return dealKinds.map(([k, label]) => {
    const why = actionBlock(k, st, m);
    return `<button class="btn" data-kind="${k}" style="--c:${DOT[k]}" ${why ? `disabled title="${esc(why)}"` : ""}><span class="dot" style="background:${DOT[k]}"></span>${label} <span class="price">${fmt(price[k])} $PAPER</span></button>`;
  }).join("");
}
function renderChrome() {
  if (!document.body.dataset.tabs) {
    document.body.dataset.tabs = "1";
    const go = (t) => {
      document.body.dataset.tab = t;
      for (const a of document.querySelectorAll("[data-tab-to]")) a.classList.toggle("on", a.dataset.tabTo === t);
      window.scrollTo({ top: 0 });
    };
    for (const a of document.querySelectorAll("[data-tab-to]")) a.onclick = (e) => {
      e.preventDefault();
      go(a.dataset.tabTo);
    };
  }
  const th = $("theme");
  if (th && !th.dataset.done) {
    th.dataset.done = "1";
    try {
      const t = localStorage.getItem("tama_theme");
      if (t) document.documentElement.dataset.theme = t;
    } catch {
    }
    th.onclick = () => {
      const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try {
        localStorage.setItem("tama_theme", document.documentElement.dataset.theme);
      } catch {
      }
    };
  }
  renderGarden(app.stats, app.moods, app.box);
}
const MOTES = [[14, 22, 0], [31, 48, 5], [58, 18, 9], [72, 40, 3], [88, 28, 12]].map(([x, y, d]) => `<i class="mote" style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join("");
const NO_F = { items: [], floor_slots: [], wall_slots: [] };
function roomBg(m, st) {
  const F = app.F ?? NO_F;
  return roomSvg(F, app.did, lifetime(m.events, app.box, localDay), { hako: st.grave ? "tomb" : "away", theme: "css" }) + MOTES;
}
function roomInfo(m, st) {
  if (!app.F) return "";
  const n = lifetime(m.events, app.box, localDay);
  const have = unlocked(app.F, n), next = nextUnlock(app.F, n);
  const art = app.lastArticle ?? (m.fold?.outs ?? []).slice(-1)[0] ?? null;
  return `<div class="roominfo" id="room"><p class="label">ROOM \xB7 ${have.length}/${app.F.items.length}</p>
    <div class="chips">${have.map((x) => `<span class="chip">${esc(x.ja)}</span>`).join("") || `<span class="small">\u307E\u3060\u4F55\u3082\u306A\u3044\u90E8\u5C4B\u3067\u3059</span>`}</div>
    ${next ? `<p class="small">\u6B21\u306F <b>${esc(next.ja)}</b>\uFF08${esc(whenText(next))}\uFF09</p>` : ""}
    <div class="actions">
      <button class="btn sub" id="snapshot">HAKO \u3092\u30B7\u30A7\u30A2</button>
    </div></div>`;
}
async function snapshot(m, st) {
  const n = lifetime(m.events, app.box, localDay);
  const art = st.grave ? null : app.lastArticle ?? (m.fold?.outs ?? []).slice(-1)[0] ?? null;
  const said = st.grave ? "Here lies a happy little HAKO. It will be back." : lastSay(m.fold);
  const title = `HAKO \u2026${app.did.slice(-8)}`;
  const stage = $("stage");
  if (stage) {
    stage.classList.remove("flash");
    void stage.offsetWidth;
    stage.classList.add("flash");
  }
  try {
    const png = await svgToPng(scrapSvg(app.F, app.did, n, title, {
      stage: st.stage,
      grave: st.grave,
      hunger: st.hunger,
      mood: st.mood,
      hungerMax: app.box.hunger_max,
      moodMax: app.box.mood_max,
      streak: st.streak,
      rebirths: st.rebirths,
      lines: art?.lines ?? [],
      say: said,
      day: localDay(Date.now(), app.box)
    }));
    const file = new File([png], `hako-${app.did.slice(-8).toLowerCase()}.png`, { type: "image/png" });
    const u = new URL(`h/${app.did.slice(-8).toLowerCase()}.html`, location.href);
    const v = String(app.stats?.box?.generated ?? "").replace(/[^0-9]/g, "");
    if (v) u.searchParams.set("v", v);
    const text = st.grave ? `${title} \u306F\u304A\u5893\u3067\u4F11\u3093\u3067\u3044\u307E\u3059 #HAKONIWA` : art ? `${title} \u306E\u304A\u3067\u304B\u3051\u8A18\u4E8B #HAKONIWA` : `${title} \u306E\u90E8\u5C4B #HAKONIWA`;
    const src = URL.createObjectURL(file);
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    document.getElementById("snap")?.remove();
    const box = document.createElement("div");
    box.className = "snap";
    box.id = "snap";
    box.innerHTML = `<div class="photo"><img src="${src}" alt="${esc(title)} \u306E\u90E8\u5C4B\u306E\u5199\u771F"><p class="mono">${esc(title)}</p></div>
      <div class="actions"><button class="btn" id="snap-share" style="--c:var(--accent)">\u30B7\u30A7\u30A2\u3059\u308B</button><a class="btn sub" id="snap-save" href="${src}" download="${file.name}">\u753B\u50CF\u3092\u4FDD\u5B58</a><button class="btn sub" id="snap-close">\u3068\u3058\u308B</button></div>`;
    document.body.appendChild(box);
    const close = () => {
      box.remove();
      URL.revokeObjectURL(src);
    };
    box.onclick = (e) => {
      if (e.target === box) close();
    };
    box.querySelector("#snap-close").onclick = close;
    box.querySelector("#snap-share").onclick = async () => {
      if (canShare) {
        try {
          await navigator.share({ files: [file], text, url: u.href });
        } catch {
        }
        return;
      }
      box.querySelector("#snap-save").click();
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(u.href)}`, "_blank", "noopener");
    };
  } catch (e) {
    app.why = `\u753B\u50CF\u3092\u4F5C\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`;
    render();
  }
}
function playsToday(m) {
  const today = localDay(Date.now(), app.box);
  const done = m.events.filter((e) => e.t === "play" && localDay(e.ms, app.box) === today).length;
  const live2 = app.deals.play?.busy() ? 1 : 0;
  return done + live2;
}
function actionBlock(kind, st, m) {
  const x = app.deals[kind];
  if (x?.busy()) return x.st.gaveUp ? "PAPER \u304C\u623B\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059" : "\u3044\u307E\u306F\u305D\u306E\u9014\u4E2D\u3067\u3059";
  const price = { meal: app.box.meal_price, out: app.box.out_price, play: app.box.play_stake }[kind];
  if (st.grave) return "\u304A\u5893\u306E\u9593\u306F\u3067\u304D\u307E\u305B\u3093";
  if (m.balance < Number(price)) return "PAPER \u304C\u8DB3\u308A\u307E\u305B\u3093";
  if (kind === "out" && st.outsToday >= Number(app.box.out_per_day)) return `\u304A\u3067\u304B\u3051\u306F 1 \u65E5 ${app.box.out_per_day} \u56DE\u307E\u3067\u3067\u3059`;
  if (kind === "out" && st.hunger < Number(app.box.out_min_hunger ?? 0)) return `\u304A\u306A\u304B\u304C ${app.box.out_min_hunger} \u4EE5\u4E0A\u306A\u3044\u3068\u3001\u304A\u3067\u304B\u3051\u3067\u304D\u307E\u305B\u3093`;
  if (kind === "play" && playsToday(m) >= Number(app.box.play_per_day ?? Infinity)) return `\u3042\u305D\u3076\u306F 1 \u65E5 ${app.box.play_per_day} \u56DE\u307E\u3067\u3067\u3059`;
  if (kind === "play" && !(app.box.npcs ?? []).length) return "\u3042\u305D\u3073\u76F8\u624B\u304C\u307E\u3060\u3044\u307E\u305B\u3093";
  return null;
}
function renderSaid(fold) {
  const el = $("said");
  if (!el) return;
  const meals = (fold?.meals ?? []).slice(-3).reverse();
  if (app.lastSay && !meals.some((x) => x.line === app.lastSay)) meals.unshift({ line: app.lastSay });
  let outs = (fold?.outs ?? []).slice(-1);
  if (app.lastArticle && !(fold?.outs ?? []).some((o) => o.contract === app.lastArticle.contract)) outs = [app.lastArticle];
  el.innerHTML = [
    ...outs.map((o) => `<article class="article">${o.lines.map((l, i) => i === 0 ? `<h3>${esc(l)}</h3>` : `<p>${esc(l)}</p>`).join("")}</article>`),
    ...meals.length > 1 ? [`<p class="label" style="margin-top:12px">\u3053\u308C\u307E\u3067\u306E\u3072\u3068\u3053\u3068</p>`] : [],
    ...meals.slice(1).map((x) => `<p class="bubble">${esc(x.line)}</p>`)
  ].join("");
}
function renderEgg() {
  $("view").innerHTML = `
    <section class="card" id="me">
      <div class="stage plain"><div class="egg">${spriteSvg(null, "egg", 6)}</div></div>
      <p class="label" style="margin-top:14px">NEW HAKO</p>
      <h2>HAKO \u3092\u8FCE\u3048\u308B</h2>
      <p>\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306E\u4E2D\u3067\u9375\u3092\u4F5C\u308A\u3001\u3042\u306A\u305F\u306E HAKO \u304C\u751F\u307E\u308C\u307E\u3059\u3002\u9375\u306F\u5916\u306B\u9001\u308A\u307E\u305B\u3093\u3002\u306A\u304F\u3059\u3068 HAKO \u3092\u52D5\u304B\u305B\u306A\u304F\u306A\u308B\u306E\u3067\u3001\u751F\u307E\u308C\u305F\u3042\u3068\u306B\u9375\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
      <p class="note">\u306F\u3058\u3081\u306B ${fmt(app.box.initial_paper)} $PAPER \u3092\u53D7\u3051\u53D6\u308A\u307E\u3059\u3002PAPER \u306F\u3053\u306E\u7BB1\u5EAD\u306E\u4E2D\u3060\u3051\u306E\u70B9\u6570\u3067\u3001\u304A\u91D1\u3068\u3057\u3066\u306E\u4FA1\u5024\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u63DB\u91D1\u3082\u58F2\u308A\u8CB7\u3044\u3082\u3067\u304D\u307E\u305B\u3093\u3002</p>
      <label>\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\uFF08\u9375\u3092\u958B\u304F\u3068\u304D\u306B\u4F7F\u3044\u307E\u3059\uFF09<input id="p1" type="password" autocomplete="new-password"></label>
      <label>\u3082\u3046\u4E00\u5EA6<input id="p2" type="password" autocomplete="new-password"></label>
      <div class="actions"><button class="btn" id="born" style="--c:var(--good)"><span class="dot" style="background:var(--good)"></span>\u751F\u307E\u308C\u308B</button></div>
      <p class="small">\u9375\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308B\u3068\u304D\u306F <label class="link">\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3080<input id="file" type="file" accept="application/json" hidden></label></p>
      <p id="why" class="why"></p>
    </section>`;
  $("born").onclick = register;
  $("file").onchange = importKey;
}
function sleeping() {
  let st = null;
  try {
    st = lifeState(merged(app.stats, app.did).events, Date.now(), app.box);
  } catch {
    st = null;
  }
  return spriteSvg(app.did, st?.born ? st.grave ? "ghost" : st.stage : "egg", 6, { eye: "line" });
}
function renderUnlock() {
  $("view").innerHTML = `
    <section class="card" id="me">
      <div class="stage plain">${app.did ? `<div class="hako">${sleeping()}</div>` : ""}</div>
      <p>HAKO \u2026${esc(app.did.slice(-8))} \u304C\u7720\u3063\u3066\u3044\u307E\u3059\u3002\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3067\u9375\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002</p>
      <label>\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA<input id="p1" type="password" autocomplete="current-password"></label>
      <div class="actions"><button class="btn" id="open">\u9375\u3092\u958B\u304F</button></div>
      <label class="small"><input id="tab" type="checkbox" checked> \u3053\u306E\u30BF\u30D6\u3092\u9589\u3058\u308B\u307E\u3067\u899A\u3048\u308B</label>
      <p id="why" class="why"></p>
    </section>`;
  $("open").onclick = unlock;
}
const say = (s) => {
  const w = $("why");
  if (w) w.textContent = s;
};
async function register() {
  const p1 = $("p1").value, p2 = $("p2").value;
  if (p1.length < 8) return say("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u306F 8 \u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
  if (p1 !== p2) return say("2 \u3064\u306E\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u304C\u9055\u3044\u307E\u3059");
  if (!await K.supported()) return say("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F Ed25519 \u306E\u9375\u3092\u4F5C\u308C\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u30D6\u30E9\u30A6\u30B6\u3067\u958B\u3044\u3066\u304F\u3060\u3055\u3044");
  say("\u9375\u3092\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026");
  const { priv, did, rec } = await K.makeKey(p1);
  K.saveRec(rec);
  await K.rememberTab(priv, did);
  app.did = did;
  app.priv = priv;
  app.signer = watched(makeSigner(did, priv));
  try {
    await app.signer.post(app.box.board, tamaLine({ t: "join", v: 1, n: rand() }));
  } catch (e) {
    say(`\u63B2\u793A\u677F\u306B\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09\u3002\u3082\u3046\u4E00\u5EA6\u62BC\u3057\u3066\u304F\u3060\u3055\u3044`);
    return;
  }
  addLocal(did, { t: "join", ms: Date.now() });
  K.downloadRec(rec);
  app.rebornUntil = Date.now() + 2500;
  setTimeout(render, 2600);
  await boot();
}
async function importKey(ev) {
  try {
    const j = JSON.parse(await ev.target.files[0].text());
    if (!K.isKeyFile(j)) return say("\u9375\u306E\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    K.saveRec(j);
    app.did = j.did;
    render();
  } catch (e) {
    say(`\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`);
  }
}
async function unlock() {
  const rec = K.loadRec();
  try {
    const priv = await K.openKey(rec, $("p1").value);
    app.priv = priv;
    app.signer = watched(makeSigner(app.did, priv));
    if ($("tab").checked) await K.rememberTab(priv, app.did);
    await boot();
  } catch {
    say("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u304C\u9055\u3044\u307E\u3059");
  }
}
async function reborn() {
  try {
    await app.signer.post(app.box.board, tamaLine({ t: "reborn", n: rand() }));
  } catch (e) {
    return say(`\u63B2\u793A\u677F\u306B\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`);
  }
  const fee = Math.min(Number(app.box.reborn_price ?? 0), Math.max(0, app.balance ?? 0));
  addLocal(app.did, { t: "reborn", ms: Date.now() }, -fee);
  app.rebornUntil = Date.now() + 2500;
  setTimeout(render, 2600);
  render();
}
async function startDeal(kind) {
  const x = app.deals[kind];
  const why = actionBlock(kind, app.st, merged(app.stats, app.did));
  if (why) return say(why);
  say("");
  const r = await x.start({ st: app.st, stats: app.stats });
  if (!r.ok) say(r.why);
  render();
}
function onDeal(kind, ev) {
  if (ev.type === "settled") {
    addLocal(app.did, { t: kind, ms: ev.ms, contract: ev.contract }, ev.delta);
    if (kind === "play") app.happyUntil = Date.now() + 8e3;
    if (kind === "out" && ev.lines) {
      let facts = null;
      try {
        facts = JSON.parse(app.deals.out.st.offer.job.context).facts;
      } catch {
        facts = null;
      }
      app.lastArticle = { contract: ev.contract, lines: facts ? fillArticle(ev.lines, facts) : ev.lines };
    }
    if (kind === "meal" && ev.say) {
      app.lastSay = ev.say;
      app.why = "";
    } else if (ev.say) app.why = ev.say;
    logOp(`settled \xB7 ${kind} \xB7 ${short(ev.contract)} \xB7 ${ev.delta >= 0 ? "+" : ""}${ev.delta} PAPER`);
  } else if (ev.type === "note") app.why = ev.text;
  render();
}
async function boot() {
  for (const [k] of dealKinds) app.deals[k] = new Deal({ kind: k, app, onEvent: (ev) => onDeal(k, ev) });
  render();
  const tick = async () => {
    for (const x of Object.values(app.deals)) await x.tick().catch((e) => x.note?.(`error ${e.message}`));
    if (!document.hidden) render();
  };
  setInterval(tick, 5e3);
  setInterval(async () => {
    try {
      app.stats = await loadStats();
    } catch {
    }
  }, 5 * 6e4);
  tick();
}
async function loadStats() {
  const r = await fetch(`latest.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`latest.json ${r.status}`);
  return await r.json();
}
async function start() {
  try {
    app.stats = await loadStats();
  } catch {
    app.stats = null;
  }
  app.box = app.stats?.box?.config ?? await (await fetch("tama_box.json")).json();
  try {
    app.F = await (await fetch("tama_furniture.json")).json();
  } catch {
    app.F = null;
  }
  try {
    app.moods = await (await fetch(`moods.json?t=${Date.now()}`, { cache: "no-store" })).json();
  } catch {
    app.moods = null;
  }
  setVenue(app.box.venue);
  const rec = K.loadRec();
  app.did = rec?.did ?? null;
  if (app.did) {
    app.priv = await K.recallTab(app.did);
    if (app.priv) {
      app.signer = watched(makeSigner(app.did, app.priv));
      return boot();
    }
  }
  render();
}
export {
  addLocal,
  app,
  boot,
  loadLocal,
  merged,
  opLine,
  render,
  saveLocal,
  setMotion,
  start
};
