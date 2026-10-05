import { faceSvg } from "./tama_sprite.js";
import { L } from "./tama_i18n.js";
import { storyHtml, howHtml, watchPages } from "./tama_book.js";
const shown = {};
import { localDay, rewardOf, boxAt } from "./tama_core.js";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(Number(n)).toLocaleString("ja-JP");
const short = (did) => "\u2026" + String(did).slice(-8);
const $ = (id) => document.getElementById(id);
function avatar(did, px = 3) {
  try {
    return faceSvg(did, px);
  } catch {
    return "";
  }
}
function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1e3));
  if (s < 60) return L(`${s}\u79D2\u524D`, `${s}s ago`);
  if (s < 3600) return L(`${Math.floor(s / 60)}\u5206\u524D`, `${Math.floor(s / 60)}m ago`);
  if (s < 86400) return L(`${Math.floor(s / 3600)}\u6642\u9593\u524D`, `${Math.floor(s / 3600)}h ago`);
  return L(`${Math.floor(s / 86400)}\u65E5\u524D`, `${Math.floor(s / 86400)}d ago`);
}
const playEv = (stake, payout) => payout == null ? { what: L("\u3042\u305D\u3093\u3060", "played") } : { what: L(`${stake} \u3092\u8CED\u3051\u3066 ${payout} \u623B\u3063\u305F`, `bet ${stake}, got ${payout} back`), delta: payout - stake };
function gardenEvents(stats) {
  if (stats?.feed) return stats.feed.map((r) => ({
    did: r.did,
    ms: r.ms,
    kind: r.kind,
    // 庭用の garden.json（tama_site.split_ledger）
    what: r.kind === "join" ? L("\u751F\u307E\u308C\u305F", "was born") : r.kind === "reborn" ? L("\u751F\u307E\u308C\u5909\u308F\u3063\u305F", "was reborn") : r.line ?? "",
    ...r.kind === "play" ? playEv(r.stake, r.payout) : {}
  }));
  const out = [];
  for (const [did, d] of Object.entries(stats?.did ?? {})) {
    if (d.operator) continue;
    for (const e of d.events ?? []) {
      if (e.t === "join") out.push({ did, ms: e.ms, kind: "join", what: L("\u751F\u307E\u308C\u305F", "was born") });
      else if (e.t === "reborn") out.push({ did, ms: e.ms, kind: "reborn", what: L("\u751F\u307E\u308C\u5909\u308F\u3063\u305F", "was reborn") });
    }
    for (const x of d.meals ?? []) out.push({ did, ms: x.ms, kind: "meal", what: x.line });
    for (const x of d.outs ?? []) out.push({ did, ms: x.ms, kind: "out", what: x.lines?.[0] ?? "" });
    for (const x of d.plays ?? []) out.push({ did, ms: x.ms, kind: "play", ...playEv(x.stake, x.payout) });
  }
  return out.sort((a, b) => b.ms - a.ms);
}
const MOOD_JA = { flow: "\u8857\u306E\u306B\u304E\u308F\u3044\uFF081 \u5206\u3042\u305F\u308A\u306E\u884C\u6570\uFF09", alike: "\u4F3C\u305F\u6587\u306E\u5272\u5408", nocontract: "contract \u6B04\u306E\u306A\u3044 accept \u306E\u5272\u5408", refund: "\u8FD4\u91D1\u3067\u7D42\u308F\u3063\u305F\u53D6\u5F15\u306E\u5272\u5408", newcomer: "\u521D\u3081\u3066\u898B\u308B\u9854\u306E\u5272\u5408" };
const MOOD_EN = { flow: "bustle (lines per minute)", alike: "share of look-alike messages", nocontract: "share of accepts without a contract field", refund: "share of deals that ended in a refund", newcomer: "share of first-time faces" };
const town = () => L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore");
const moodLabel = (tw) => L(MOOD_JA[tw.metric] ?? tw.label, MOOD_EN[tw.metric] ?? tw.label);
const KINDS = () => ({ meal: [L("\u3054\u306F\u3093", "Meal"), "var(--meal)"], out: [L("\u304A\u3067\u304B\u3051", "Outing"), "var(--out)"], play: [L("\u3042\u305D\u3076", "Play"), "var(--play)"], join: [L("\u8A95\u751F", "Born"), "var(--good)"], reborn: [L("\u751F\u307E\u308C\u5909\u308F\u308A", "Reborn"), "var(--accent)"] });
function renderGarden(stats, moods, box, F = null) {
  const ev = gardenEvents(stats);
  const now = Date.now();
  const hakos = Number(stats?.box?.hakos ?? 0);
  const today = box ? localDay(now, box) : null;
  const todays = today ? ev.filter((e) => localDay(e.ms, box) === today) : [];
  const day = today ? stats?.counts?.[today] : null;
  const count = (k) => day ? Number(day[k] ?? 0) : todays.filter((e) => e.kind === k).length;
  const tw = moods?.twist, KIND = KINDS();
  const known = ev.filter((e) => KIND[e.kind]);
  const items = known.slice(0, 14).map((e) => {
    const [label] = KIND[e.kind];
    const tail = e.kind === "play" && e.delta != null ? `<span class="${e.delta >= 0 ? "up" : "down"}">${e.delta >= 0 ? "+" : ""}${e.delta}</span>` : `<span class="dim">${ago(e.ms, now)}</span>`;
    return `<span class="item">${avatar(e.did, 2)}<span class="mono">${esc(short(e.did))}</span>${label} ${tail}</span>`;
  });
  if (tw) items.push(`<span class="item"><span class="mono">${town()}</span>${esc(moodLabel(tw))} <b class="mono">${esc(tw.value)}</b><span class="dim mono">${L(`\uFF08\u666E\u6BB5 ${esc(tw.base)}\uFF09`, `(usually ${esc(tw.base)})`)}</span></span>`);
  else if (moods) items.push(`<span class="item"><span class="mono">${town()}</span>${L("\u9727\u3067\u3088\u304F\u898B\u3048\u306A\u3044", "too foggy to see")}</span>`);
  if (!items.length) items.push(`<span class="item">${L("\u307E\u3060\u8AB0\u3082\u3044\u306A\u3044\u5EAD\u3067\u3059\u3002\u6700\u521D\u306E HAKO \u3092\u8FCE\u3048\u3066\u304F\u3060\u3055\u3044", "No one is in the garden yet. Welcome the first HAKO.")}</span>`);
  const t = $("ticker");
  if (t) t.innerHTML = items.join("") + items.join("");
  const live = $("live");
  if (live) live.innerHTML = `<p class="label"><span class="pulse"></span>LIVE \xB7 HAKO ${fmt(hakos)}</p>
    <div class="big mono">${fmt(day ? Object.values(day).reduce((a, b) => a + Number(b), 0) : todays.length)}<span class="sub"> ${L("\u4ECA\u65E5\u306E\u51FA\u6765\u4E8B", "events today")}</span></div>
    <p class="sub mono">${L("\u3054\u306F\u3093", "Meals")} ${count("meal")} \xB7 ${L("\u304A\u3067\u304B\u3051", "Outings")} ${count("out")} \xB7 ${L("\u3042\u305D\u3076", "Plays")} ${count("play")}</p>
    <p class="label" style="margin-top:14px">${L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857\u306E\u96F0\u56F2\u6C17", "Mood of Technocore")}${moods?.hour ? L(` \xB7 ${esc(moods.hour.slice(11, 13))}\u6642\u53F0 UTC`, ` \xB7 ${esc(moods.hour.slice(11, 13))}:00 UTC`) : ""}</p>
    ${tw ? `<div>${L(`<b>${esc(moodLabel(tw))}</b> \u304C\u666E\u6BB5\u3088\u308A${tw.dir === "higher" ? "\u591A\u3044" : "\u5C11\u306A\u3044"}`, `<b>${esc(moodLabel(tw))}</b> is ${tw.dir === "higher" ? "higher" : "lower"} than usual`)}</div><div class="mono sub">${esc(tw.value)} ${L("\uFF0F \u666E\u6BB5", "/ usually")} ${esc(tw.base)}</div>` : `<div class="sub">${L("\u9727\u3067\u3088\u304F\u898B\u3048\u306A\u3044\uFF08\u6570\u5B57\u306F\u88DC\u3044\u307E\u305B\u3093\uFF09", "Too foggy to see (numbers are never made up)")}</div>`}`;
  const g = $("garden");
  if (g) g.innerHTML = `<div class="head"><h2 style="margin:0">${L("\u5EAD\u306E\u3088\u3046\u3059", "Garden")}</h2><span class="label" style="margin:0">${L("\u5E33\u7C3F\u4FC2", "Ledger")} ${esc(String(stats?.box?.generated ?? "").slice(11, 16))} UTC</span></div>
    ${known.length ? `<ul>${known.slice(0, 12).map((e) => {
    const [label, color] = KIND[e.kind];
    return `<li><span class="av">${avatar(e.did, 2)}</span><div><div class="who2">${label}<span class="mono">${esc(short(e.did))}</span></div><div class="what">${esc(e.what)}</div></div><span class="t mono" style="color:${color}">${ago(e.ms, now)}</span></li>`;
  }).join("")}</ul>` : `<p class="small">${L("\u307E\u3060\u51FA\u6765\u4E8B\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u5E33\u7C3F\u4FC2\u306F 1 \u6642\u9593\u3054\u3068\u306B\u6570\u3048\u307E\u3059\u3002", "Nothing has happened yet. The ledger keeper counts once an hour.")}</p>`}`;
  const put = (id, html) => {
    const el = $(id);
    if (!el || shown[id] === html) return;
    shown[id] = html;
    el.innerHTML = html;
    watchPages(el);
  };
  if (box) {
    const b = boxAt(box, Date.now());
    put("story", storyHtml(b, moods, F));
    put("how", howHtml(b, F));
  }
  const s = $("status");
  if (s) s.innerHTML = `<span><span class="live-dot"></span>live</span><span>HAKO ${fmt(hakos)}</span><span>${L("\u5E33\u7C3F\u4FC2", "Ledger")} ${esc(String(stats?.box?.generated ?? "-").replace("T", " ").slice(0, 16))} UTC</span><span>${town()} ${moods?.hour ? esc(moods.hour.slice(11, 13)) + L("\u6642\u53F0", ":00") : "-"} \xB7 ${moods?.rows ? fmt(moods.rows) + L(" \u884C", " lines") : "-"}</span><span>${esc(box?.version ?? "")}</span>`;
}
export {
  ago,
  avatar,
  gardenEvents,
  renderGarden
};
