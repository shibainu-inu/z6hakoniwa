import { lifeState, localDay, tamaLine, fillArticle } from "./tama_core.js";
import { setVenue, makeSigner, readTail } from "./tama_net.js";
import * as K from "./tama_key.js";
import { dotSvg, eggSvg, pubFromDid, dotDerive } from "./hako_dot.js";
import { Deal, dealKinds } from "./tama_deal.js";
import { lifetime, unlocked, nextUnlock, whenText, roomSvg, frameSvg, svgToPng } from "./tama_room.js";
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
const TOMB = [
  "    ######    ",
  "  ##      ##  ",
  " #          # ",
  " #  R I P   # ",
  " #          # ",
  " #   ####   # ",
  " #    ##    # ",
  " #    ##    # ",
  " #          # ",
  " #          # ",
  "##############"
];
function tombSvg(px) {
  const rows = TOMB.map((r) => r.replace(/[RIP]/g, " "));
  const W = rows[0].length * px, H = rows.length * px + px * 3;
  let d = "";
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === "#") d += `M${x * px} ${y * px}h${px}v${px}h-${px}z`;
  }));
  const flowers = [[1, "#f5a3b5"], [11, "#f2cf6b"], [3, "#a394ee"]].map(([x, c]) => `<rect x="${x * px}" y="${rows.length * px}" width="${px}" height="${px}" fill="${c}"/><rect x="${x * px}" y="${(rows.length + 1) * px}" width="${px}" height="${px * 2}" fill="#5ec99a"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="\u304A\u5893"><path d="${d}" fill="#f0ede6" shape-rendering="crispEdges"/><text x="${W / 2}" y="${px * 4.4}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${px * 1.6}" fill="#f0ede6">RIP</text>${flowers}</svg>`;
}
const FRAMES = {
  normal: [{}, {}, {}, {}, {}, {}, {}, { eye: "line" }],
  eat: [{ mouth: "open" }, { mouth: "small" }],
  happy: [{ eye: "smiley", mouth: "open" }, { eye: "smiley", mouth: "smile" }],
  sad: [{ eye: "sleepy", mouth: "flat" }]
};
let timer = null;
function setMotion(kind) {
  if (app.motion === kind && timer) return;
  app.motion = kind;
  clearInterval(timer);
  timer = null;
  const stage = $("stage");
  if (!stage) return;
  stage.className = `stage m-${kind}`;
  const pub = pubFromDid(app.did);
  if (kind === "grave") {
    stage.innerHTML = tombSvg(10);
    return;
  }
  if (kind === "out") {
    stage.innerHTML = `<div class="away">${outSign()}<p>\u304A\u3067\u304B\u3051\u4E2D</p></div>`;
    return;
  }
  if (kind === "reborn") {
    stage.innerHTML = `<div class="egg">${eggSvg(9)}</div>`;
    return;
  }
  const frames = FRAMES[kind] ?? FRAMES.normal;
  let i = 0;
  const draw = () => {
    stage.innerHTML = `<div class="hako">${dotSvg(pub, 9, frames[i % frames.length])}</div>${kind === "eat" ? bowl() : ""}`;
    i += 1;
  };
  draw();
  timer = setInterval(draw, kind === "normal" ? 500 : 300);
}
const bowl = () => `<svg class="bowl" viewBox="0 0 16 10" width="64" height="40"><path d="M0 2h16v2h-1v2h-2v2h-2v2h-6v-2h-2v-2h-2v-2h-1z" fill="#e0e0e0" shape-rendering="crispEdges"/><path d="M2 0h12v2h-12z" fill="#f5a06e" shape-rendering="crispEdges"/></svg>`;
const outSign = () => `<svg viewBox="0 0 16 16" width="96" height="96"><path d="M7 4h2v12h-2z M2 1h11l2 2-2 2h-11z" fill="#c9a181" shape-rendering="crispEdges"/></svg>`;
function hearts(v, max) {
  const n = Math.round(Number(v) / Number(max) * 5);
  return `<span class="hearts" aria-label="${Math.round(v)} / ${max}">${"\u2665".repeat(n)}<span class="off">${"\u2665".repeat(5 - n)}</span></span>`;
}
function motionOf(st) {
  if (!st.born) return "normal";
  if (app.rebornUntil && Date.now() < app.rebornUntil) return "reborn";
  if (st.grave) return "grave";
  const live = (x) => x.st && !x.st.done && !x.st.gaveUp;
  const busy = Object.values(app.deals).find((x) => live(x) && x.st.locked) ?? Object.values(app.deals).find(live);
  if (busy?.kind === "meal") return "eat";
  if (busy?.kind === "out") return "out";
  if (app.happyUntil && Date.now() < app.happyUntil) return "happy";
  if (st.hunger < 25 || st.mood < 20) return "sad";
  return "normal";
}
function render() {
  const view = $("view");
  if (!app.did) return renderEgg();
  if (!app.priv) return renderUnlock();
  const m = merged(app.stats, app.did);
  const st = lifeState(m.events, Date.now(), app.box);
  app.st = st;
  app.balance = m.balance;
  if (!st.born) return renderEgg();
  const d = dotDerive(pubFromDid(app.did));
  const graveNote = st.grave ? `<p class="note">\u304A\u306A\u304B\u304C\u7A7A\u3063\u307D\u306E\u307E\u307E ${app.box.grave_after_hours} \u6642\u9593\u304C\u305F\u3063\u3066\u3001\u304A\u5893\u306B\u306A\u308A\u307E\u3057\u305F\u3002\u751F\u307E\u308C\u5909\u308F\u308B\u3068\u3001\u540C\u3058 HAKO \u304C\u3082\u3046\u4E00\u5EA6\u306F\u3058\u3081\u304B\u3089\u3084\u308A\u76F4\u3057\u307E\u3059\uFF08\u90E8\u5C4B\u3068\u3053\u308C\u307E\u3067\u306E\u8A18\u9332\u306F\u305D\u306E\u307E\u307E\uFF09\u3002</p>` : "";
  view.innerHTML = `
    <section class="card">
      <div id="stage" class="stage"></div>
      <div class="status">
        <p class="name">HAKO \u2026${esc(app.did.slice(-8))}</p>
        ${st.grave ? "" : `<p>\u304A\u306A\u304B ${hearts(st.hunger, app.box.hunger_max)}</p><p>\u3054\u304D\u3052\u3093 ${hearts(st.mood, app.box.mood_max)}</p>`}
        <p class="small">\u8CA1\u5E03 ${fmt(m.balance)} $PAPER${m.fromFold ? "" : "\uFF08\u5E33\u7C3F\u306B\u8F09\u308B\u307E\u3067\u306E\u898B\u8FBC\u307F\uFF09"}\u3000\u9023\u7D9A ${st.streak} \u65E5${st.rebirths ? `\u3000\u751F\u307E\u308C\u5909\u308F\u308A ${st.rebirths} \u56DE` : ""}</p>
      </div>
      ${graveNote}
      <div class="actions">${st.grave ? `<button id="reborn">\u751F\u307E\u308C\u5909\u308F\u308B</button>` : dealKinds.map(([k, label]) => `<button data-kind="${k}" ${actionBlock(k, st, m) ? "disabled" : ""}>${label}</button>`).join("")}
      </div>
      <p id="why" class="small">${esc(app.why ?? "")}</p>
      <div id="said"></div>
    </section>
    ${roomCard(m, st)}`;
  app.motion = null;
  setMotion(motionOf(st));
  if (st.grave) $("reborn").onclick = reborn;
  for (const b of view.querySelectorAll("button[data-share]")) b.onclick = () => share(b.dataset.share, m, st);
  for (const b of view.querySelectorAll("button[data-kind]")) b.onclick = () => startDeal(b.dataset.kind);
  renderSaid(m.fold);
}
function roomCard(m, st) {
  if (!app.F) return "";
  const n = lifetime(m.events, app.box, localDay);
  const have = unlocked(app.F, n), next = nextUnlock(app.F, n);
  const svg = roomSvg(app.F, app.did, n, { hako: st.grave ? "grave" : motionOf(st) === "out" ? "away" : "alive" });
  const art = app.lastArticle ?? (m.fold?.outs ?? []).slice(-1)[0] ?? null;
  return `<section class="card"><h2 class="h">\u90E8\u5C4B</h2><div class="room">${svg}</div>
    <p class="small">${have.length ? `\u7F6E\u3044\u3066\u3042\u308B\u3082\u306E: ${have.map((x) => esc(x.ja)).join("\u30FB")}` : "\u307E\u3060\u4F55\u3082\u306A\u3044\u90E8\u5C4B\u3067\u3059"}${next ? `\u3000\u6B21\u306F ${esc(next.ja)}\uFF08${esc(whenText(next))}\uFF09` : ""}</p>
    <div class="actions">
      <button class="sub" data-share="${st.grave ? "grave" : "room"}">${st.grave ? "\u304A\u5893\u3092\u984D\u7E01\u306B\u3057\u3066\u30B7\u30A7\u30A2" : "\u90E8\u5C4B\u3092\u984D\u7E01\u306B\u3057\u3066\u30B7\u30A7\u30A2"}</button>
      ${art ? `<button class="sub" data-share="article">\u8A18\u4E8B\u3092\u984D\u7E01\u306B\u3057\u3066\u30B7\u30A7\u30A2</button>` : ""}
    </div></section>`;
}
async function share(kind, m, st) {
  const n = lifetime(m.events, app.box, localDay);
  const inner = roomSvg(app.F, app.did, n, { hako: st.grave ? "grave" : "alive" });
  const art = app.lastArticle ?? (m.fold?.outs ?? []).slice(-1)[0] ?? null;
  const lines = kind === "article" && art ? art.lines : kind === "grave" ? ["Here lies a happy little HAKO. It will be back."] : [];
  const title = `HAKO \u2026${app.did.slice(-8)}`;
  try {
    const png = await svgToPng(frameSvg(inner, title, lines));
    const file = new File([png], `hako-${app.did.slice(-8).toLowerCase()}-${kind}.png`, { type: "image/png" });
    const url = new URL(`h/${app.did.slice(-8).toLowerCase()}.html`, location.href).href;
    const text = kind === "article" ? `${title} \u306E\u304A\u3067\u304B\u3051\u8A18\u4E8B #HAKONIWA` : kind === "grave" ? `${title} \u306F\u304A\u5893\u3067\u4F11\u3093\u3067\u3044\u307E\u3059 #HAKONIWA` : `${title} \u306E\u90E8\u5C4B #HAKONIWA`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  } catch (e) {
    app.why = `\u753B\u50CF\u3092\u4F5C\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`;
    render();
  }
}
function actionBlock(kind, st, m) {
  const x = app.deals[kind];
  if (x?.busy()) return x.st.gaveUp ? "PAPER \u304C\u623B\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059" : "\u3044\u307E\u306F\u305D\u306E\u9014\u4E2D\u3067\u3059";
  const price = { meal: app.box.meal_price, out: app.box.out_price, play: app.box.play_stake }[kind];
  if (m.balance < Number(price)) return "PAPER \u304C\u8DB3\u308A\u307E\u305B\u3093";
  if (kind === "out" && st.outsToday >= Number(app.box.out_per_day)) return `\u304A\u3067\u304B\u3051\u306F 1 \u65E5 ${app.box.out_per_day} \u56DE\u307E\u3067\u3067\u3059`;
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
    ...meals.map((x) => `<p class="bubble">${esc(x.line)}</p>`)
  ].join("");
}
function renderEgg() {
  $("view").innerHTML = `
    <section class="card">
      <div class="stage"><div class="egg">${eggSvg(9)}</div></div>
      <h2>HAKO \u3092\u8FCE\u3048\u308B</h2>
      <p>\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306E\u4E2D\u3067\u9375\u3092\u4F5C\u308A\u3001\u3042\u306A\u305F\u306E HAKO \u304C\u751F\u307E\u308C\u307E\u3059\u3002\u9375\u306F\u5916\u306B\u9001\u308A\u307E\u305B\u3093\u3002\u306A\u304F\u3059\u3068 HAKO \u3092\u52D5\u304B\u305B\u306A\u304F\u306A\u308B\u306E\u3067\u3001\u751F\u307E\u308C\u305F\u3042\u3068\u306B\u9375\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
      <p class="note">\u306F\u3058\u3081\u306B ${fmt(app.box.initial_paper)} $PAPER \u3092\u53D7\u3051\u53D6\u308A\u307E\u3059\u3002PAPER \u306F\u3053\u306E\u7BB1\u5EAD\u306E\u4E2D\u3060\u3051\u306E\u70B9\u6570\u3067\u3001\u304A\u91D1\u3068\u3057\u3066\u306E\u4FA1\u5024\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u63DB\u91D1\u3082\u58F2\u308A\u8CB7\u3044\u3082\u3067\u304D\u307E\u305B\u3093\u3002</p>
      <label>\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\uFF08\u9375\u3092\u958B\u304F\u3068\u304D\u306B\u4F7F\u3044\u307E\u3059\uFF09<input id="p1" type="password" autocomplete="new-password"></label>
      <label>\u3082\u3046\u4E00\u5EA6<input id="p2" type="password" autocomplete="new-password"></label>
      <button id="born">\u751F\u307E\u308C\u308B</button>
      <p class="small">\u9375\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308B\u3068\u304D\u306F <label class="link">\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3080<input id="file" type="file" accept="application/json" hidden></label></p>
      <p id="why" class="small"></p>
    </section>`;
  $("born").onclick = register;
  $("file").onchange = importKey;
}
function renderUnlock() {
  $("view").innerHTML = `
    <section class="card">
      <div class="stage">${app.did ? `<div class="hako">${dotSvg(pubFromDid(app.did), 9, { eye: "line" })}</div>` : ""}</div>
      <p>HAKO \u2026${esc(app.did.slice(-8))} \u304C\u7720\u3063\u3066\u3044\u307E\u3059\u3002\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3067\u9375\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002</p>
      <label>\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA<input id="p1" type="password" autocomplete="current-password"></label>
      <button id="open">\u9375\u3092\u958B\u304F</button>
      <label class="small"><input id="tab" type="checkbox" checked> \u3053\u306E\u30BF\u30D6\u3092\u9589\u3058\u308B\u307E\u3067\u899A\u3048\u308B</label>
      <p id="why" class="small"></p>
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
  app.signer = makeSigner(did, priv);
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
    app.signer = makeSigner(app.did, priv);
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
  addLocal(app.did, { t: "reborn", ms: Date.now() });
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
  setVenue(app.box.venue);
  const rec = K.loadRec();
  app.did = rec?.did ?? null;
  if (app.did) {
    app.priv = await K.recallTab(app.did);
    if (app.priv) {
      app.signer = makeSigner(app.did, app.priv);
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
  render,
  saveLocal,
  setMotion,
  start
};
