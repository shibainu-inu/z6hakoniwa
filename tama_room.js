import { spriteRows, iconRows, inside, paint, THEMES } from "./tama_sprite.js";
import { L } from "./tama_i18n.js";
import { boxAt, stamps } from "./tama_core.js";
const FRAME = { bg: "#f4f1ea", ink: "#16151c", sub: "#55525e", edge: "#c9a181" };
function lifetime(events, box, localDay) {
  const n = { meals: 0, outs: 0, plays: 0, days: 0, rebirths: 0, earned: 0 };
  const days = new Set();
  for (const e of events) {
    if (e.t === "meal") n.meals++;
    else if (e.t === "out") n.outs++;
    else if (e.t === "play") n.plays++;
    else if (e.t === "reborn") n.rebirths++;
    if (e.t === "out") n.earned += Number(e.reward ?? 0);
    if (e.t === "play" && !e.sit && e.payout != null) n.earned += Math.max(0, Number(e.payout) - Number(box.play_stake));
    if (["meal", "play"].includes(e.t)) days.add(localDay(e.ms, box));
  }
  n.days = days.size;
  const oldJoin = welcomeCounts(events);
  n.stamps = Object.entries(stamps(events)).reduce((a, [k, s]) => a + (k === "welcome" && !oldJoin ? 0 : s.n), 0);
  n.joined = events.some((e) => e.t === "join") ? 1 : 0;
  n.peak = peakPaper(events.filter((e) => e.ms < PEAK_UNTIL), box);
  const was = { meals: 0, outs: 0, plays: 0, days: 0, rebirths: 0 }, wdays = new Set();
  for (const e of events) {
    if (e.ms >= WAS_UNTIL) continue;
    if (e.t === "meal") was.meals++;
    else if (e.t === "out") was.outs++;
    else if (e.t === "play") was.plays++;
    if (["meal", "out", "play"].includes(e.t)) wdays.add(localDay(e.ms, box));
  }
  was.days = wdays.size;
  n.was = was;
  return n;
}
function peakPaper(events, box) {
  let bal = 0, peak = 0;
  for (const e of [...events].sort((a, b) => a.ms - b.ms)) {
    const sit = !!e.sit, b = boxAt(box, e.ms);
    if (e.t === "join") bal += Number(e.initial ?? b.initial_paper);
    else if (e.t === "meal") bal -= Number(e.price ?? (sit ? b.sit_price : b.meal_price));
    else if (e.t === "out") bal += Number(e.reward ?? 0) - Number(e.price ?? b.out_price);
    else if (e.t === "play") bal += (sit ? 0 : Number(e.payout ?? 0)) - Number(e.price ?? (sit ? b.sit_play_price : b.play_stake));
    else if (e.t === "reborn") bal -= Number(e.fee ?? b.reborn_price ?? 0);
    peak = Math.max(peak, bal);
  }
  return Math.round(peak * 100) / 100;
}
const welcomeCounts = (events) => events.some((e) => e.t === "join" && e.ms < PEAK_UNTIL);
const WAS_UNTIL = 17910261e5;
const PEAK_UNTIL = 17912556e5;
const has = (it, n) => (n[it.when[0]] ?? 0) >= it.when[1] || !!it.was && (n.was?.[it.was[0]] ?? 0) >= it.was[1] || it.peak != null && (n.peak ?? 0) >= it.peak;
const hasItem = has;
const unlocked = (F, n) => F.items.filter((it) => has(it, n));
const nextUnlock = (F, n) => F.items.find((it) => !has(it, n)) ?? null;
const WHEN_JA = { meals: "\u3054\u306F\u3093", outs: "\u304A\u3067\u304B\u3051", plays: "\u3042\u305D\u3076", days: "\u304A\u4E16\u8A71\u3057\u305F\u65E5", rebirths: "\u751F\u307E\u308C\u5909\u308F\u308A", joined: "\u8FCE\u3048\u305F" };
const WHEN_EN = { meals: "meals", outs: "outings", plays: "plays", days: "care days", rebirths: "rebirths", joined: "welcome" };
const whenText = (it, n) => it.when[0] === "stamps" ? ((k) => L(`\u30B9\u30BF\u30F3\u30D7\u3042\u3068 ${k} \u3064`, `${k} more stamp${k === 1 ? "" : "s"}`))(Math.max(0, it.when[1] - (n?.stamps ?? 0))) : L(`${WHEN_JA[it.when[0]]} ${it.when[1]} ${it.when[0] === "days" ? "\u65E5" : "\u56DE"}`, `${it.when[1]} ${WHEN_EN[it.when[0]]}`);
function dots(ox, oy, rows, px, color) {
  let d = "";
  rows.forEach((r, y) => {
    let x = 0;
    while (x < r.length) {
      let k = 1;
      while (x + k < r.length && r[x + k] === r[x]) k++;
      if (r[x] === "#") d += `M${ox + x * px} ${oy + y * px}h${k * px}v${px}h-${k * px}z`;
      x += k;
    }
  });
  return d ? `<path d="${d}" fill="${color}" shape-rendering="crispEdges"/>` : "";
}
const TOMB = ["    ######    ", "  ##      ##  ", " #          # ", " #          # ", " #          # ", " #   ####   # ", " #    ##    # ", " #    ##    # ", " #          # ", " #          # ", "##############"];
const FLOWERS = [[-3, "#f5a3b5"], [15, "#f2cf6b"], [17, "#a394ee"]];
const HAKO_PX = 5;
function spot(rows, kind = "hako", { w = 480, h = 300 } = {}) {
  const floorY = Math.round(h * 0.62), hp = HAKO_PX, sw = rows[0].length * hp;
  const left = kind === "ghost" ? w / 2 + 11 * hp : w / 2 - sw / 2;
  const bottom = kind === "ghost" ? h - floorY + 2 * hp : h - floorY - 2 * hp;
  return { left: left / w * 100, bottom: bottom / h * 100, width: sw / w * 100 };
}
function artLayers(ox, oy, rows, px, palette, T) {
  let o = "";
  for (const [ch, color] of Object.entries(palette ?? { "#": "ink" })) {
    if (!rows.some((r) => r.includes(ch))) continue;
    o += dots(ox, oy, rows.map((r) => [...r].map((c) => c === ch ? "#" : " ").join("")), px, color === "ink" ? T.ink : color);
  }
  return o;
}
function artSvg(rows, palette, theme = "css", cls = "") {
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}">${artLayers(0, 0, rows, 1, palette, THEMES[theme])}</svg>`;
}
function roomSvg(F, did, n, { w = 480, h = 300, px = 6, hako = "alive", stage = "hako", over = {}, theme = "light" } = {}) {
  const T = THEMES[theme];
  const figure = (x, y, rows, color) => paint(dots, x, y, rows, HAKO_PX, color, theme);
  const floorY = Math.round(h * 0.62);
  let o = `<rect width="${w}" height="${h}" fill="${T.wall}"/><rect y="${floorY}" width="${w}" height="${h - floorY}" fill="${T.floor}"/><rect y="${floorY}" width="${w}" height="2" fill="${T.edge}"/>`;
  px = F.px ?? px;
  for (const it of unlocked(F, n)) {
    const rows = it.art, aw = rows[0].length * px, ah = rows.length * px;
    const floor = it.place === "floor";
    const ox = floor ? Math.floor(F.floor_slots[it.slot] * w - aw / 2) : Math.floor(F.wall_slots[it.slot][0] * w - aw / 2);
    const oy = floor ? floorY - ah + px : Math.floor(F.wall_slots[it.slot][1] * h);
    if (floor) o += `<ellipse cx="${ox + Math.floor(aw / 2)}" cy="${floorY + px}" rx="${Math.floor(aw * 11 / 20)}" ry="${px}" fill="${T.edge}"/>`;
    if (it.glow) o += `<circle class="glow" cx="${ox + it.glow[0] * px}" cy="${oy + it.glow[1] * px}" r="${it.glow[2] * px}" fill="${it.glow[3]}" opacity="0.2"/>`;
    o += artLayers(ox, oy, rows, px, F.palette, T);
  }
  const hp = HAKO_PX;
  if (hako === "grave" || hako === "tomb") {
    const tx = Math.round(w / 2 - TOMB[0].length * hp / 2), ty = floorY - TOMB.length * hp + hp;
    o += dots(tx, ty, inside(TOMB), hp, T.in) + dots(tx, ty, TOMB, hp, T.ink);
    o += `<text x="${tx + 7 * hp}" y="${ty + Math.round(hp * 4.4)}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${Math.round(hp * 1.6)}" fill="${T.ink}">RIP</text>`;
    for (const [c, color] of FLOWERS) o += `<rect x="${tx + c * hp}" y="${floorY - 2 * hp}" width="${hp}" height="${hp}" fill="${color}"/><rect x="${tx + c * hp}" y="${floorY - hp}" width="${hp}" height="${2 * hp}" fill="#5ec99a"/>`;
    if (hako === "grave") {
      const [rows, color] = spriteRows(did, "ghost");
      o += `<g opacity="0.75">${figure(Math.round(w / 2 + 11 * hp), floorY - rows.length * hp - 2 * hp, rows, color)}</g>`;
    }
  } else if (hako === "away") {
  } else {
    const [rows, color] = spriteRows(did, stage, over);
    o += figure(Math.round(w / 2 - rows[0].length * hp / 2), floorY - rows.length * hp + hp * 2, rows, color);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${o}</svg>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function frameSvg(innerSvg, title, lines = [], caption = "") {
  const W = 1200, H = 630;
  const body = innerSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const text = lines.slice(0, 5).map((l, i) => `<text x="80" y="${470 + i * 30}" font-family="sans-serif" font-size="${i === 0 ? 24 : 20}" fill="${i === 0 ? FRAME.ink : FRAME.sub}">${esc(l.length > 90 ? l.slice(0, 89) + "\u2026" : l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${FRAME.bg}"/><rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${FRAME.edge}" stroke-width="12"/>` + (lines.length ? `<g transform="translate(80 60) scale(${1040 / 480 * 0.36})">${body}</g><text x="${W - 80}" y="96" text-anchor="end" font-family="monospace" font-size="28" fill="${FRAME.ink}">${esc(title)}</text>` : `<g transform="translate(${(W - 480 * 1.4) / 2} ${caption ? 36 : 60}) scale(1.4)">${body}</g><text x="${W / 2}" y="${H - 58}" text-anchor="middle" font-family="monospace" font-size="28" fill="${FRAME.ink}">${esc(title)}</text>` + (caption ? `<text x="${W / 2}" y="${H - 104}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${FRAME.sub}">\u201C${esc(caption.length > 64 ? caption.slice(0, 63) + "\u2026" : caption)}\u201D</text>` : "")) + `${text}</svg>`;
}
function wrap(text, max, rowsMax) {
  const out = [];
  let cur = "";
  for (const w of String(text).split(/\s+/)) {
    if (!w) continue;
    if ((cur + " " + w).trim().length <= max) {
      cur = (cur + " " + w).trim();
      continue;
    }
    if (cur) out.push(cur);
    cur = w.length > max ? w.slice(0, max - 1) + "\u2026" : w;
  }
  if (cur) out.push(cur);
  if (out.length > rowsMax) {
    out.length = rowsMax;
    out[rowsMax - 1] = out[rowsMax - 1].replace(/.{0,2}$/, "\u2026");
  }
  return out;
}
function scrapSvg(F, did, n, title, o = {}) {
  const W = 1200, H = 630, k = W / 480, floor = Math.round(300 * 0.62 * k) - 60;
  const room = roomSvg(F, did, n, { hako: o.grave ? "tomb" : "away", theme: "light" }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const fig = (rows2, color2, x, y, px2) => paint(dots, x, y, rows2, px2, color2, "light");
  const [rows, color] = spriteRows(did, o.grave ? "ghost" : o.stage ?? "hako", { level: o.level || 1 });
  const px = 12, hw = rows[0].length * px, hh = rows.length * px, hx = 290, hy = floor - hh + px * 2 - (o.grave ? 40 : 0);
  const hako = `<g transform="rotate(-9 ${hx + hw / 2} ${hy + hh})"${o.grave ? ' opacity="0.8"' : ""}>${fig(rows, color, hx, hy, px)}</g>`;
  const lines = o.lines?.length ? o.lines : o.say ? [`\u201C${o.say}\u201D`] : [];
  let paper = "";
  if (lines.length) {
    const head = wrap(lines[0], 27, 3), body = [];
    for (const l of lines.slice(1, 5)) for (const r of wrap(l, 46, 2)) if (head.length * 40 + (body.length + 1) * 29 <= 232) body.push(r);
    let y = 168;
    const text = head.map((r) => {
      const t = `<text x="540" y="${y}" font-family="sans-serif" font-weight="800" font-size="31" fill="${FRAME.ink}">${esc(r)}</text>`;
      y += 40;
      return t;
    }).join("") + body.map((r, i) => {
      if (i === 0) y += 4;
      const t = `<text x="540" y="${y}" font-family="sans-serif" font-size="21" fill="${FRAME.sub}">${esc(r)}</text>`;
      y += 29;
      return t;
    }).join("");
    paper = `<g transform="rotate(-4 830 240)"><rect x="518" y="70" width="630" height="350" fill="#16151c" opacity="0.12"/><rect x="510" y="60" width="630" height="350" fill="#fffdf8"/><rect x="522" y="72" width="606" height="326" fill="none" stroke="#cfc8b8" stroke-width="2" stroke-dasharray="7 6"/><text x="540" y="112" font-family="monospace" font-size="19" fill="${FRAME.sub}">${esc(title)}</text>` + (o.day ? `<text x="1110" y="112" text-anchor="end" font-family="monospace" font-size="19" fill="${FRAME.sub}">${esc(o.day)}</text>` : "") + `<rect x="540" y="124" width="570" height="3" fill="${FRAME.ink}"/>${text}<rect x="560" y="43" width="110" height="32" fill="#f2cf6b" opacity="0.75" transform="rotate(-7 615 59)"/><rect x="990" y="43" width="110" height="32" fill="#f5a3b5" opacity="0.75" transform="rotate(6 1045 59)"/></g>`;
  }
  const meter = (label, v, max, x) => {
    const on = Math.round(Number(v) / Number(max) * 10), c = on >= 6 ? "#2fbf71" : on >= 3 ? "#ffc933" : "#d9434b";
    return `<text x="${x}" y="508" font-family="sans-serif" font-weight="700" font-size="19" fill="${FRAME.ink}">${label}</text><text x="${x + 236}" y="508" text-anchor="end" font-family="monospace" font-size="17" fill="${FRAME.sub}">${Math.round(v)}/${max}</text>` + Array.from({ length: 10 }, (_, i) => `<rect x="${x + i * 24}" y="518" width="20" height="12" rx="3" fill="${i < on ? c : "#eae6db"}"/>`).join("");
  };
  const rec = [L(`\u9023\u7D9A ${o.streak ?? 0} \u65E5`, `Streak ${o.streak ?? 0}d`), L(`\u304A\u4E16\u8A71\u3057\u305F\u65E5 ${n.days}`, `Care days ${n.days}`), L(`\u3054\u306F\u3093 ${n.meals}`, `Meals ${n.meals}`), L(`\u304A\u3067\u304B\u3051 ${n.outs}`, `Outings ${n.outs}`), L(`\u3042\u305D\u3076 ${n.plays}`, `Plays ${n.plays}`), ...o.rebirths ? [L(`\u751F\u307E\u308C\u5909\u308F\u308A ${o.rebirths}`, `Rebirths ${o.rebirths}`)] : []];
  let cx = 92;
  const chips = rec.map((t) => {
    const w = 26 + [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 17 : 10), 0);
    const g = `<rect x="${cx}" y="548" width="${w}" height="32" rx="16" fill="#f9f7f2" stroke="#eae6db" stroke-width="2"/><text x="${cx + w / 2}" y="570" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="17" fill="${FRAME.ink}">${esc(t)}</text>`;
    cx += w + 8;
    return g;
  }).join("");
  const cardW = Math.max(600, cx - 92 + 32);
  const card = `<g transform="rotate(1.5 380 520)"><rect x="76" y="466" width="${cardW}" height="130" rx="18" fill="#16151c" opacity="0.10"/><rect x="70" y="458" width="${cardW}" height="130" rx="18" fill="#ffffff" stroke="#eae6db" stroke-width="2"/>` + (o.grave ? `<text x="92" y="516" font-family="sans-serif" font-weight="800" font-size="24" fill="${FRAME.ink}">${L("\u304A\u5893\u3067\u4F11\u3093\u3067\u3044\u307E\u3059", "Resting in its grave")}</text>` : meter(L("\u304A\u306A\u304B", "Tummy"), o.hunger ?? 0, o.hungerMax ?? 100, 92) + meter(L("\u3054\u304D\u3052\u3093", "Mood"), o.mood ?? 0, o.moodMax ?? 100, 352)) + chips + `</g>`;
  const [irows, icolor] = iconRows();
  const logo = `<g opacity="0.72">${fig(irows, icolor, 1010, 558, 2)}<text x="1054" y="584" font-family="sans-serif" font-weight="800" font-size="22" fill="${FRAME.sub}">${L("\u30CF\u30B3\u30CB\u30EF", "HAKONIWA")}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${FRAME.bg}"/><g transform="translate(0 -60) scale(${k})">${room}</g>${hako}${paper}${card}${logo}<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${FRAME.edge}" stroke-width="24"/></svg>`;
}
function svgToPng(svg, w = 1200, h = 630) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob")), "image/png");
    };
    img.onerror = () => reject(new Error("svg image"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
export {
  FRAME,
  HAKO_PX,
  PEAK_UNTIL,
  WAS_UNTIL,
  artLayers,
  artSvg,
  frameSvg,
  hasItem,
  lifetime,
  nextUnlock,
  peakPaper,
  roomSvg,
  scrapSvg,
  spot,
  svgToPng,
  unlocked,
  welcomeCounts,
  whenText
};
