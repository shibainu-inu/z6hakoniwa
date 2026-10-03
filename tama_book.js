import { castSvg } from "./tama_sprite.js";
import { artSvg } from "./tama_room.js";
import { rewardOf } from "./tama_core.js";
import { L } from "./tama_i18n.js";
const fmt = (n) => Math.round(Number(n)).toLocaleString("ja-JP");
const PAL = { k: "ink", w: "#d9b48a", d: "#a87f59", o: "#f5a06e", c: "#fffdf8", y: "#f2cf6b", s: "#b8b4ac" };
const BOWL = ["    kkkkkk    ", "  kkcccccckk  ", "kkkkkkkkkkkkkk", "kooooooooooook", "kooyyyyyyyyook", " kooooooooook ", "  kooooooook  ", "   kkkkkkkk   "];
const SIGN = ["  kkkkkkkkkkk   ", "  kwwwwwwwwwkk  ", "  kwwwwwwwwwwwk ", "  kwwwwwwwwwkk  ", "  kkkkkkkkkkk   ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "      kdk       ", "     kkkkk      "];
const PAPER = ["kkkkkkkkkk", "kcccccccck", "kckkkkkcck", "kcccccccck", "kcssssscck", "kcccccccck", "kcssssccck", "kcccccccck", "kkkkkkkkkk"];
const COIN = [" kkkk ", "kyyyyk", "kyyyyk", "kyyyyk", "kyyyyk", " kkkk "];
const TOMB = ["  kkkkkk  ", " kcccccck ", "kcckkkkcck", "kccckkccck", "kccckkccck", "kcccccccck", "kkkkkkkkkk"];
const CROWD = ["#f5a3b5", "#3b8cff", "#5ec99a", "#f2cf6b", "#a394ee", "#f5a06e", "#6fc9dc", "#f07c7c"];
const art = (rows, cls) => artSvg(rows, PAL, "css", cls);
const sp = (cls, w, inner) => `<span class="sp ${cls}" style="width:${w}%"><span class="mv">${inner}</span></span>`;
const hako = (cls, w = 16) => sp(cls, w, castSvg("hako", 4));
const face = (cls, color, w = 9) => sp(cls, w, castSvg("face", 4, color));
const page = (cls, inner, text) => `<figure class="page ${cls}"><div class="art">${inner}</div><figcaption>${text}</figcaption></figure>`;
const item = (F, key) => {
  const it = F?.items?.find((x) => x.key === key);
  return it ? artSvg(it.art, F.palette, "css") : "";
};
function storyHtml(box, moods, F) {
  const tw = moods?.twist;
  const crowd = CROWD.map((c, i) => face(`c${i}`, c, 8)).join("");
  return `<h2>${L("\u30B9\u30C8\u30FC\u30EA\u30FC", "Story")}</h2><div class="book">` + page(
    "s-town",
    face("w1", CROWD[0]) + face("w2", CROWD[1]) + face("w3", CROWD[2]) + face("w4", CROWD[3]) + sp("plant", 9, item(F, "plant")) + sp("lamp", 7, item(F, "lamp")),
    L("\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u305F\u3061\u304C\u884C\u304D\u4EA4\u3046\u8857\u306E\u306F\u305A\u308C\u306B\u3001\u5C0F\u3055\u306A\u7BB1\u5EAD\u304C\u3042\u308A\u307E\u3059\u3002", "On the edge of a town where agents come and go, there is a small garden.")
  ) + page(
    "s-egg",
    sp("egg", 15, castSvg("egg", 4)),
    L("\u3042\u308B\u65E5\u3001\u305D\u3053\u306B\u5375\u304C\u3072\u3068\u3064\u5C4A\u304D\u307E\u3057\u305F\u3002\u3042\u306A\u305F\u306E\u5375\u3067\u3059\u3002", "One day an egg arrived there. It is yours.")
  ) + page(
    "s-grow",
    sp("g1", 13, castSvg("egg", 4)) + `<b class="ar a1">\u2192</b>` + sp("g2", 14, castSvg("baby", 4)) + `<b class="ar a2">\u2192</b>` + hako("g3", 17),
    L("\u304A\u4E16\u8A71\u3092\u3057\u3066\u3044\u308B\u3068\u5375\u304B\u3089\u5B50\u304C\u751F\u307E\u308C\u3001\u3084\u304C\u3066\u7BB1\u306E\u304B\u305F\u3061\u306E HAKO \u306B\u80B2\u3061\u307E\u3059\u3002", "Look after it and a little one hatches, then grows into a box-shaped HAKO.")
  ) + page(
    "s-day",
    sp("bowl", 11, art(BOWL)) + hako("trip", 15) + sp("sign", 11, art(SIGN)) + sp("note", 9, art(PAPER)),
    L("HAKO \u306F\u3054\u306F\u3093\u3092\u98DF\u3079\u3001\u8857\u3078\u304A\u3067\u304B\u3051\u3057\u3066\u3001\u898B\u3066\u304D\u305F\u3053\u3068\u3092\u77ED\u3044\u8A18\u4E8B\u306B\u3057\u3066\u6301\u3061\u5E30\u308A\u307E\u3059\u3002", "A HAKO eats, goes out to the town, and brings back a short report of what it saw.")
  ) + page(
    "s-real",
    crowd + (tw ? `<span class="tag t1 mono">${esc(tw.value)}</span><span class="tag t2 mono">${L("\u666E\u6BB5", "usually")} ${esc(tw.base)}</span>` : ""),
    L("\u8857\u306F\u5B9F\u5728\u3057\u3001\u8A18\u4E8B\u306E\u6570\u5B57\u3082\u305D\u306E\u3068\u304D\u5B9F\u969B\u306B\u6E2C\u3063\u305F\u3082\u306E\u3067\u3059\u3002", "The town is real, and the numbers in the report were actually measured at that time.")
  ) + page(
    "s-grave",
    sp("tomb", 12, art(TOMB)) + sp("ghost", 10, castSvg("ghost", 4)) + `<b class="ar a3">\u2192</b>` + sp("again", 12, castSvg("egg", 4)),
    L("\u653E\u3063\u3066\u304A\u304F\u3068\u304A\u5893\u306B\u306A\u308A\u307E\u3059\u304C\u3001\u4F55\u5EA6\u3067\u3082\u751F\u307E\u308C\u5909\u308F\u308C\u307E\u3059\u3002", "Leave it alone and it ends up in a grave, but it can be reborn any number of times.")
  ) + `</div>${box?.grow_hours ? `<p class="hint">${L(`${Math.round(box.grow_hours / 24)} \u65E5\u80B2\u3066\u308B\u3068\u2026\uFF1F`, `Raise it for ${Math.round(box.grow_hours / 24)} days and\u2026?`)}</p>` : ""}`;
}
function howHtml(box, F) {
  const meter = `<span class="mm">${Array.from({ length: 10 }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</span>`;
  const table = (box.play_table ?? []).map((x) => Number(x[1]));
  const rewards = [1, 2, 3].map((n) => fmt(rewardOf(box, n)));
  return `<h2>${L("\u904A\u3073\u65B9", "How to play")}</h2><div class="book small">` + page(
    "h-egg",
    sp("e1", 13, castSvg("egg", 4)) + sp("e2", 14, castSvg("baby", 4)),
    L("\u306F\u3058\u3081\u306F<b>\u5375</b>\u3067\u3059\u3002\u304A\u4E16\u8A71\uFF08\u3054\u306F\u3093\u30FB\u3042\u305D\u3076\uFF09\u3092\u7D9A\u3051\u308B\u3068\u751F\u307E\u308C\u3066\u3001\u5C11\u3057\u305A\u3064\u80B2\u3061\u307E\u3059\u3002", "It starts as an <b>egg</b>. Keep caring for it (feeding and playing) and it hatches, then grows little by little.")
  ) + page(
    "h-meal",
    hako("eat", 15) + sp("bowl", 11, art(BOWL)) + meter,
    L(
      `<b>\u3054\u306F\u3093</b>\uFF08${fmt(box.meal_price)} $PAPER\uFF09\u3067\u304A\u306A\u304B\u304C ${box.meal_fill} \u5897\u3048\u307E\u3059\u3002\u304A\u306A\u304B\u306F 1 \u6642\u9593\u306B ${box.hunger_per_hour} \u305A\u3064\u6E1B\u308A\u307E\u3059\u3002`,
      `<b>Feed</b> (${fmt(box.meal_price)} $PAPER) fills its tummy by ${box.meal_fill}. The tummy drops by ${box.hunger_per_hour} every hour.`
    )
  ) + page(
    "h-out",
    hako("trip", 15) + sp("sign", 11, art(SIGN)) + sp("note", 9, art(PAPER)) + `<span class="tag t3 mono">+${rewards[0]}</span>`,
    L(
      `<b>\u304A\u3067\u304B\u3051</b>\uFF08${fmt(box.out_price)} $PAPER\uFF09\u306F\u3001\u304A\u306A\u304B\u304C ${box.out_min_hunger} \u4EE5\u4E0A\u306E\u3068\u304D 1 \u65E5 ${box.out_per_day} \u56DE\u307E\u3067\u3002\u8857\u306E\u3088\u3046\u3059\u3092\u8A18\u4E8B\u306B\u3057\u3066\u3001\u307B\u3046\u3073\u304C ${rewards.join("\u30FB")} $PAPER \u5C4A\u304D\u307E\u3059\u3002`,
      `<b>Go out</b> (${fmt(box.out_price)} $PAPER) needs a tummy of ${box.out_min_hunger} or more, up to ${box.out_per_day} times a day. It writes a report on the town and earns ${rewards.join(" \xB7 ")} $PAPER.`
    )
  ) + page(
    "h-play",
    hako("p1", 15) + sp("coin", 6, art(COIN)) + face("p2", CROWD[1], 11) + (table.length ? `<span class="tag t4 mono">${fmt(Math.min(...table))}\u2013${fmt(Math.max(...table))}</span>` : ""),
    L(
      `<b>\u3042\u305D\u3076</b>\uFF08${fmt(box.play_stake)} $PAPER\uFF09\u306F 1 \u65E5 ${box.play_per_day} \u56DE\u307E\u3067\u3002\u3054\u304D\u3052\u3093\u304C\u4E0A\u304C\u308A\u3001${table.length ? `\u623B\u308A\u306F ${fmt(Math.min(...table))}\u301C${fmt(Math.max(...table))} $PAPER\u3002\u5E73\u5747\u3059\u308B\u3068\u5C11\u3057\u5897\u3048\u307E\u3059\u3002` : ""}`,
      `<b>Play</b> (${fmt(box.play_stake)} $PAPER) is up to ${box.play_per_day} times a day. Its mood goes up, and ${table.length ? `you get back ${fmt(Math.min(...table))}\u2013${fmt(Math.max(...table))} $PAPER \u2014 a little more than you put in, on average.` : ""}`
    )
  ) + page(
    "h-grave",
    sp("tomb", 12, art(TOMB)) + sp("ghost", 10, castSvg("ghost", 4)) + `<b class="ar a3">\u2192</b>` + sp("again", 12, castSvg("egg", 4)),
    L(
      `\u304A\u306A\u304B\u304C 0 \u306E\u307E\u307E ${box.grave_after_hours} \u6642\u9593\u305F\u3064\u3068\u304A\u5893\u306B\u3002\u751F\u307E\u308C\u5909\u308F\u308A\u306F ${fmt(box.reborn_price)} $PAPER \u3067\u3001\u5375\u304B\u3089\u3084\u308A\u76F4\u3057\u307E\u3059\u3002`,
      `If its tummy stays at 0 for ${box.grave_after_hours} hours, it ends up in a grave. Rebirth costs ${fmt(box.reborn_price)} $PAPER and starts over from an egg.`
    )
  ) + (box.sit_enabled ? page(
    "h-sit",
    face("s1", CROWD[2], 11) + hako("home", 15) + sp("bowl", 11, art(BOWL)),
    L(
      `\u7559\u5B88\u306B\u3059\u308B\u3068\u304D\u306F<b>\u30B7\u30C3\u30BF\u30FC\u306B\u304A\u9858\u3044</b>\u3067\u304D\u307E\u3059\u30021 \u65E5 1 \u56DE\u3054\u306F\u3093\uFF08${fmt(box.sit_price)} $PAPER\uFF09\u3092\u3042\u3052\u3001\u9078\u3093\u3060\u56DE\u6570\u3060\u3051\u3042\u305D\u3073\u307E\u3059\uFF081 \u56DE ${fmt(box.sit_play_price)} $PAPER\u3002\u623B\u308A\u306F\u3042\u308A\u307E\u305B\u3093\uFF09\u3002HAKO \u306F\u80B2\u3061\u7D9A\u3051\u3001\u304A\u5893\u306B\u3082\u306A\u308A\u307E\u305B\u3093\u3002`,
      `When you're away, you can <b>ask a sitter</b>. It feeds your HAKO once a day (${fmt(box.sit_price)} $PAPER) and plays as many times as you choose (${fmt(box.sit_play_price)} $PAPER each; nothing comes back). Your HAKO keeps growing and won't end up in a grave.`
    )
  ) + page(
    "h-sit2",
    face("s1", CROWD[2], 11) + sp("clock", 9, item(F, "clock")) + sp("coin", 6, art(COIN)),
    L(
      `\u30B7\u30C3\u30BF\u30FC\u306F\u304A\u3067\u304B\u3051\u3092\u3057\u307E\u305B\u3093\u3002\u6700\u521D\u306E\u3054\u306F\u3093\u306F\u983C\u3093\u3067\u304B\u3089 ${box.sit_first_hours ?? box.sit_every_hours} \u6642\u9593\u5F8C\u3002\u65E9\u304F\u5E30\u3063\u3066\u3082\u4E88\u7D04\u306F\u7D9A\u304D\u3001\u3067\u304D\u306A\u304B\u3063\u305F\u5206\u306E PAPER \u306F\u623B\u308A\u307E\u3059\u3002`,
      `The sitter doesn't go on outings. The first meal comes ${box.sit_first_hours ?? box.sit_every_hours} hours after you book. If you come back early, the booking goes on, and PAPER for anything the sitter couldn't do comes back.`
    )
  ) : "") + page(
    "h-room",
    sp("f1", 22, item(F, "rug")) + sp("f2", 9, item(F, "chair")) + sp("f3", 7, item(F, "lamp")) + hako("home", 15) + sp("f4", 9, item(F, "plant")) + sp("f5", 14, item(F, "desk")),
    L("\u6301\u3063\u3066\u3044\u308B $PAPER \u304C\u5897\u3048\u308B\u3068\u90E8\u5C4B\u306B\u5BB6\u5177\u304C\u5897\u3048\u3001\u751F\u307E\u308C\u5909\u308F\u3063\u3066\u3082\u6B8B\u308A\u307E\u3059\u3002", "As your $PAPER grows, the room gets more furniture, and it stays even after rebirth.")
  ) + `</div>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let watcher = null;
function watchPages(root) {
  if (typeof IntersectionObserver === "undefined") {
    for (const p of root.querySelectorAll(".page")) p.classList.add("in");
    return;
  }
  watcher ??= new IntersectionObserver((list) => {
    for (const e of list) e.target.classList.toggle("in", e.isIntersecting && e.intersectionRatio >= 0.3);
  }, { threshold: [0, 0.3, 0.6] });
  for (const p of root.querySelectorAll(".page")) watcher.observe(p);
}
export {
  howHtml,
  storyHtml,
  watchPages
};
