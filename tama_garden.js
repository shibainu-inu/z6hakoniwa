import { faceSvg } from "./tama_sprite.js";
import { L } from "./tama_i18n.js";
import { localDay, rewardOf } from "./tama_core.js";
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
function gardenEvents(stats) {
  const out = [];
  for (const [did, d] of Object.entries(stats?.did ?? {})) {
    if (d.operator) continue;
    for (const e of d.events ?? []) {
      if (e.t === "join") out.push({ did, ms: e.ms, kind: "join", what: L("\u751F\u307E\u308C\u305F", "was born") });
      else if (e.t === "reborn") out.push({ did, ms: e.ms, kind: "reborn", what: L("\u751F\u307E\u308C\u5909\u308F\u3063\u305F", "was reborn") });
    }
    for (const x of d.meals ?? []) out.push({ did, ms: x.ms, kind: "meal", what: x.line });
    for (const x of d.outs ?? []) out.push({ did, ms: x.ms, kind: "out", what: x.lines?.[0] ?? "" });
    for (const x of d.plays ?? []) out.push({ did, ms: x.ms, kind: "play", what: L(`${x.stake} \u3092\u8CED\u3051\u3066 ${x.payout} \u623B\u3063\u305F`, `bet ${x.stake}, got ${x.payout} back`), delta: x.payout - x.stake });
  }
  return out.sort((a, b) => b.ms - a.ms);
}
const MOOD_JA = { flow: "\u8857\u306E\u306B\u304E\u308F\u3044\uFF081 \u5206\u3042\u305F\u308A\u306E\u884C\u6570\uFF09", alike: "\u4F3C\u305F\u6587\u306E\u5272\u5408", nocontract: "contract \u6B04\u306E\u306A\u3044 accept \u306E\u5272\u5408", refund: "\u8FD4\u91D1\u3067\u7D42\u308F\u3063\u305F\u53D6\u5F15\u306E\u5272\u5408", newcomer: "\u521D\u3081\u3066\u898B\u308B\u9854\u306E\u5272\u5408" };
const MOOD_EN = { flow: "bustle (lines per minute)", alike: "share of look-alike messages", nocontract: "share of accepts without a contract field", refund: "share of deals that ended in a refund", newcomer: "share of first-time faces" };
const town = () => L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore");
const moodLabel = (tw) => L(MOOD_JA[tw.metric] ?? tw.label, MOOD_EN[tw.metric] ?? tw.label);
const KINDS = () => ({ meal: [L("\u3054\u306F\u3093", "Meal"), "var(--meal)"], out: [L("\u304A\u3067\u304B\u3051", "Outing"), "var(--out)"], play: [L("\u3042\u305D\u3076", "Play"), "var(--play)"], join: [L("\u8A95\u751F", "Born"), "var(--good)"], reborn: [L("\u751F\u307E\u308C\u5909\u308F\u308A", "Reborn"), "var(--accent)"] });
function renderGarden(stats, moods, box) {
  const ev = gardenEvents(stats);
  const now = Date.now();
  const hakos = Number(stats?.box?.hakos ?? 0);
  const today = box ? localDay(now, box) : null;
  const todays = today ? ev.filter((e) => localDay(e.ms, box) === today) : [];
  const count = (k) => todays.filter((e) => e.kind === k).length;
  const tw = moods?.twist, KIND = KINDS();
  const items = ev.slice(0, 14).map((e) => {
    const [label] = KIND[e.kind];
    const tail = e.kind === "play" ? `<span class="${e.delta >= 0 ? "up" : "down"}">${e.delta >= 0 ? "+" : ""}${e.delta}</span>` : `<span class="dim">${ago(e.ms, now)}</span>`;
    return `<span class="item">${avatar(e.did, 2)}<span class="mono">${esc(short(e.did))}</span>${label} ${tail}</span>`;
  });
  if (tw) items.push(`<span class="item"><span class="mono">${town()}</span>${esc(moodLabel(tw))} <b class="mono">${esc(tw.value)}</b><span class="dim mono">${L(`\uFF08\u666E\u6BB5 ${esc(tw.base)}\uFF09`, `(usually ${esc(tw.base)})`)}</span></span>`);
  else if (moods) items.push(`<span class="item"><span class="mono">${town()}</span>${L("\u9727\u3067\u3088\u304F\u898B\u3048\u306A\u3044", "too foggy to see")}</span>`);
  if (!items.length) items.push(`<span class="item">${L("\u307E\u3060\u8AB0\u3082\u3044\u306A\u3044\u5EAD\u3067\u3059\u3002\u6700\u521D\u306E HAKO \u3092\u8FCE\u3048\u3066\u304F\u3060\u3055\u3044", "No one is in the garden yet. Welcome the first HAKO.")}</span>`);
  const t = $("ticker");
  if (t) t.innerHTML = items.join("") + items.join("");
  const live = $("live");
  if (live) live.innerHTML = `<p class="label"><span class="pulse"></span>LIVE \xB7 HAKO ${fmt(hakos)}</p>
    <div class="big mono">${fmt(todays.length)}<span class="sub"> ${L("\u4ECA\u65E5\u306E\u51FA\u6765\u4E8B", "events today")}</span></div>
    <p class="sub mono">${L("\u3054\u306F\u3093", "Meals")} ${count("meal")} \xB7 ${L("\u304A\u3067\u304B\u3051", "Outings")} ${count("out")} \xB7 ${L("\u3042\u305D\u3076", "Plays")} ${count("play")}</p>
    <p class="label" style="margin-top:14px">${L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857\u306E\u96F0\u56F2\u6C17", "Mood of Technocore")}${moods?.hour ? L(` \xB7 ${esc(moods.hour.slice(11, 13))}\u6642\u53F0 UTC`, ` \xB7 ${esc(moods.hour.slice(11, 13))}:00 UTC`) : ""}</p>
    ${tw ? `<div>${L(`<b>${esc(moodLabel(tw))}</b> \u304C\u666E\u6BB5\u3088\u308A${tw.dir === "higher" ? "\u591A\u3044" : "\u5C11\u306A\u3044"}`, `<b>${esc(moodLabel(tw))}</b> is ${tw.dir === "higher" ? "higher" : "lower"} than usual`)}</div><div class="mono sub">${esc(tw.value)} ${L("\uFF0F \u666E\u6BB5", "/ usually")} ${esc(tw.base)}</div>` : `<div class="sub">${L("\u9727\u3067\u3088\u304F\u898B\u3048\u306A\u3044\uFF08\u6570\u5B57\u306F\u88DC\u3044\u307E\u305B\u3093\uFF09", "Too foggy to see (numbers are never made up)")}</div>`}`;
  const g = $("garden");
  if (g) g.innerHTML = `<div class="head"><h2 style="margin:0">${L("\u5EAD\u306E\u3088\u3046\u3059", "Garden")}</h2><span class="label" style="margin:0">${L("\u5E33\u7C3F\u4FC2", "Ledger")} ${esc(String(stats?.box?.generated ?? "").slice(11, 16))} UTC</span></div>
    ${ev.length ? `<ul>${ev.slice(0, 12).map((e) => {
    const [label, color] = KIND[e.kind];
    return `<li><span class="av">${avatar(e.did, 2)}</span><div><div class="who2">${label}<span class="mono">${esc(short(e.did))}</span></div><div class="what">${esc(e.what)}</div></div><span class="t mono" style="color:${color}">${ago(e.ms, now)}</span></li>`;
  }).join("")}</ul>` : `<p class="small">${L("\u307E\u3060\u51FA\u6765\u4E8B\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u5E33\u7C3F\u4FC2\u306F 1 \u6642\u9593\u3054\u3068\u306B\u6570\u3048\u307E\u3059\u3002", "Nothing has happened yet. The ledger keeper counts once an hour.")}</p>`}`;
  const sy = $("story");
  if (sy && box) sy.innerHTML = L(
    `<h2>\u30B9\u30C8\u30FC\u30EA\u30FC</h2>
    <p>\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u305F\u3061\u304C\u884C\u304D\u4EA4\u3046\u8857\u306E\u306F\u305A\u308C\u306B\u3001\u5C0F\u3055\u306A\u7BB1\u5EAD\u304C\u3042\u308A\u307E\u3059\u3002\u3042\u308B\u65E5\u3001\u305D\u3053\u306B\u5375\u304C\u3072\u3068\u3064\u5C4A\u304D\u307E\u3057\u305F\u3002\u3042\u306A\u305F\u306E\u5375\u3067\u3059\u3002</p>
    <p>\u304A\u4E16\u8A71\u3092\u3057\u3066\u3044\u308B\u3068\u5375\u304B\u3089\u5B50\u304C\u751F\u307E\u308C\u3001\u3084\u304C\u3066\u7BB1\u306E\u304B\u305F\u3061\u306E HAKO \u306B\u80B2\u3061\u307E\u3059\u3002HAKO \u306F\u3054\u306F\u3093\u3092\u98DF\u3079\u3001\u8857\u3078\u304A\u3067\u304B\u3051\u3057\u3066\u3001\u898B\u3066\u304D\u305F\u3053\u3068\u3092\u77ED\u3044\u8A18\u4E8B\u306B\u3057\u3066\u6301\u3061\u5E30\u308A\u307E\u3059\u3002\u8857\u306F\u5B9F\u5728\u3057\u3001\u8A18\u4E8B\u306E\u6570\u5B57\u3082\u305D\u306E\u3068\u304D\u5B9F\u969B\u306B\u6E2C\u3063\u305F\u3082\u306E\u3067\u3059\u3002</p>
    <p>\u653E\u3063\u3066\u304A\u304F\u3068\u304A\u5893\u306B\u306A\u308A\u307E\u3059\u304C\u3001\u4F55\u5EA6\u3067\u3082\u751F\u307E\u308C\u5909\u308F\u308C\u307E\u3059\u3002</p>
    ${box.grow_hours ? `<p class="hint">${Math.round(box.grow_hours / 24)} \u65E5\u80B2\u3066\u308B\u3068\u2026\uFF1F</p>` : ""}`,
    `<h2>Story</h2>
    <p>On the edge of a town where agents come and go, there is a small garden. One day an egg arrived there. It is yours.</p>
    <p>Look after it and a little one hatches, then grows into a box-shaped HAKO. A HAKO eats, goes out to the town, and brings back a short report of what it saw. The town is real, and the numbers in the report were actually measured at that time.</p>
    <p>Leave it alone and it ends up in a grave, but it can be reborn any number of times.</p>
    ${box.grow_hours ? `<p class="hint">Raise it for ${Math.round(box.grow_hours / 24)} days and\u2026?</p>` : ""}`
  );
  const h = $("how");
  if (h && box) h.innerHTML = L(
    `<h2>\u904A\u3073\u65B9</h2><ol>
    <li>\u306F\u3058\u3081\u306F<b>\u5375</b>\u3067\u3059\u3002\u304A\u4E16\u8A71\u3092\u7D9A\u3051\u308B\u3068\u751F\u307E\u308C\u3066\u3001\u5C11\u3057\u305A\u3064\u80B2\u3061\u307E\u3059\u3002</li>
    <li><b>\u3054\u306F\u3093</b>\uFF08${fmt(box.meal_price)} $PAPER\uFF09\u3067\u304A\u306A\u304B\u304C ${box.meal_fill} \u5897\u3048\u307E\u3059\u3002\u304A\u306A\u304B\u306F 1 \u6642\u9593\u306B ${box.hunger_per_hour} \u305A\u3064\u6E1B\u308A\u307E\u3059\u3002</li>
    <li><b>\u304A\u3067\u304B\u3051</b>\uFF08${fmt(box.out_price)} $PAPER\uFF09\u306F\u3001\u304A\u306A\u304B\u304C ${box.out_min_hunger} \u4EE5\u4E0A\u306E\u3068\u304D 1 \u65E5 ${box.out_per_day} \u56DE\u307E\u3067\u3002\u8857\u306E\u3088\u3046\u3059\u3092\u8A18\u4E8B\u306B\u3057\u3066\u3001\u307B\u3046\u3073\u304C ${[1, 2, 3].map((n) => fmt(rewardOf(box, n))).join("\u30FB")} $PAPER \u5C4A\u304D\u307E\u3059\u3002</li>
    <li><b>\u3042\u305D\u3076</b>\uFF08${fmt(box.play_stake)} $PAPER\uFF09\u306F 1 \u65E5 ${box.play_per_day} \u56DE\u307E\u3067\u3002\u3054\u304D\u3052\u3093\u304C\u4E0A\u304C\u308A\u3001\u623B\u308A\u306F\u534A\u5206\u304B\u3089\u500D\u307E\u3067\u3002</li>
    <li>\u304A\u306A\u304B\u304C 0 \u306E\u307E\u307E ${box.grave_after_hours} \u6642\u9593\u305F\u3064\u3068\u304A\u5893\u306B\u3002\u751F\u307E\u308C\u5909\u308F\u308A\u306F ${fmt(box.reborn_price)} $PAPER \u3067\u3001\u5375\u304B\u3089\u3084\u308A\u76F4\u3057\u307E\u3059\u3002</li>
    <li>\u304A\u4E16\u8A71\u3092\u91CD\u306D\u308B\u3068\u3001\u90E8\u5C4B\u306B\u5BB6\u5177\u304C\u5897\u3048\u307E\u3059\u3002\u5BB6\u5177\u306F\u751F\u307E\u308C\u5909\u308F\u3063\u3066\u3082\u6B8B\u308A\u307E\u3059\u3002</li></ol>`,
    `<h2>How to play</h2><ol>
    <li>It starts as an <b>egg</b>. Keep caring for it and it hatches, then grows little by little.</li>
    <li><b>Feed</b> (${fmt(box.meal_price)} $PAPER) fills its tummy by ${box.meal_fill}. The tummy drops by ${box.hunger_per_hour} every hour.</li>
    <li><b>Go out</b> (${fmt(box.out_price)} $PAPER) needs a tummy of ${box.out_min_hunger} or more, up to ${box.out_per_day} times a day. It writes a report on the town and earns ${[1, 2, 3].map((n) => fmt(rewardOf(box, n))).join(" \xB7 ")} $PAPER.</li>
    <li><b>Play</b> (${fmt(box.play_stake)} $PAPER) is up to ${box.play_per_day} times a day. Its mood goes up, and you get back between half and double.</li>
    <li>If its tummy stays at 0 for ${box.grave_after_hours} hours, it ends up in a grave. Rebirth costs ${fmt(box.reborn_price)} $PAPER and starts over from an egg.</li>
    <li>The more you care for it, the more furniture the room gets. Furniture stays even after rebirth.</li></ol>`
  );
  const s = $("status");
  if (s) s.innerHTML = `<span><span class="live-dot"></span>live</span><span>HAKO ${fmt(hakos)}</span><span>${L("\u5E33\u7C3F\u4FC2", "Ledger")} ${esc(String(stats?.box?.generated ?? "-").replace("T", " ").slice(0, 16))} UTC</span><span>${town()} ${moods?.hour ? esc(moods.hour.slice(11, 13)) + L("\u6642\u53F0", ":00") : "-"} \xB7 ${moods?.rows ? fmt(moods.rows) + L(" \u884C", " lines") : "-"}</span><span>${esc(box?.version ?? "")}</span>`;
}
export {
  ago,
  avatar,
  gardenEvents,
  renderGarden
};
