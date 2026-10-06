import { lifeState, localDay, tamaLine, fillArticle, rewardOf, sitSchedule, sitWhy, HOUR, boxAt, playBet, outCards, hostWords, visitPrompt, stamps, stampBook, STAMP_WELCOME } from "./tama_core.js";
import { spriteSvg, spriteRows, faceSvg } from "./tama_sprite.js";
import { L, getLang, setLang } from "./tama_i18n.js";
import { setVenue, makeSigner, readTail, sha256Hex } from "./tama_net.js";
import * as K from "./tama_key.js";
import { Deal, SitDeal, slotKind, dealKinds } from "./tama_deal.js";
import { lifetime, welcomeCounts, hasItem, unlocked, nextUnlock, whenText, roomSvg, artSvg, frameSvg, scrapSvg, svgToPng, spot, HAKO_PX } from "./tama_room.js";
import { renderGarden } from "./tama_garden.js";
import { pickPhrase, phraseText } from "./tama_phrases.js";
import * as O from "./tama_omakase.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(Number(n)).toLocaleString("ja-JP");
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
const app = { stats: null, box: null, did: null, priv: null, signer: null, motion: null, deals: {}, sits: [] };
const cur = () => app.box ? boxAt(app.box, Date.now()) : {};
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
  if (!d && keep.some((e) => e.t === "join")) balance += Number(cur().initial_paper);
  for (const x of [...Object.values(app.deals), ...app.sits ?? []]) if (x.st?.locked && !x.st?.done) balance -= Number(x.st.amount ?? 0);
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
  showOps();
}
function showOps() {
  const el = $("ops"), h = opsHtml();
  if (el && app.opsShown !== h) {
    el.innerHTML = h;
    app.opsShown = h;
  }
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
const waitOf = (stage) => ({ offering: [0, L("\u76F8\u624B\u3092\u63A2\u3057\u3066\u3044\u307E\u3059", "Looking for a taker")], offered: [0, L("\u76F8\u624B\u3092\u63A2\u3057\u3066\u3044\u307E\u3059", "Looking for a taker")], locking: [1, L("PAPER \u3092\u9810\u3051\u3066\u3044\u307E\u3059", "Locking PAPER")] })[stage] ?? [2, L("\u5C4A\u304F\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059", "Waiting for delivery")];
function waitHtml() {
  const live2 = (x2) => x2.st && !x2.st.done;
  const x = Object.values(app.deals).find((d) => live2(d) && d.st.locked) ?? Object.values(app.deals).find(live2);
  if (!x) return "";
  const [step, label] = x.st.gaveUp ? [2, L("PAPER \u304C\u623B\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059", "Waiting for the PAPER to come back")] : waitOf(x.st.stage);
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
    { offset: 0.52, transform: `scaleX(${Math.max(0.45, 1 - h * 1.2)})`, opacity: 0.5 },
    { offset: 0.76, transform: "scaleX(1.08)", opacity: 1 },
    { transform: "scaleX(1)", opacity: 1 }
  ], { duration: 1150 });
  return a.finished.catch(() => {
  });
}
function approach(fig, shadow, face) {
  const S = 2.6, FAR = 400, T = 16e3;
  const smooth = (x) => x * x * (3 - 2 * x);
  const pose = (p, up = 0, rot = 0) => `translateY(${(FAR * p - up).toFixed(1)}%) rotate(${rot}deg) scale(${(1 + (S - 1) * p).toFixed(3)})`;
  const walk = (from, ms, dir) => Array.from({ length: 25 }, (_, i) => {
    const x = i / 24, p = dir > 0 ? smooth(x) : 1 - smooth(x);
    return { offset: (from + ms * x) / T, transform: pose(p, Math.abs(Math.sin(x * Math.PI * 9)) * 7 * (1 + (S - 1) * p)), easing: "linear" };
  });
  const UP = "cubic-bezier(.2,.7,.4,1)", DOWN = "cubic-bezier(.6,0,.85,.4)";
  const frames = [
    ...walk(0, 6e3, 1),
    // 0〜6 秒: 歩いてくる（だんだん下枠に隠れる）
    { offset: 6800 / T, transform: pose(1), easing: UP },
    // 下枠の下で、ひと呼吸
    { offset: 7150 / T, transform: pose(1, 155), easing: "linear" },
    // 1 回目: 跳ねて、目の高さまで
    { offset: 7600 / T, transform: pose(1, 148), easing: DOWN },
    { offset: 7950 / T, transform: pose(1), easing: "linear" },
    { offset: 8600 / T, transform: pose(1), easing: UP },
    { offset: 8950 / T, transform: pose(1, 225, -5), easing: SINE },
    // 2 回目: 高く跳ねて（口まで見える）、左右を見る
    { offset: 9450 / T, transform: pose(1, 216, 5), easing: SINE },
    { offset: 9900 / T, transform: pose(1, 210, 0), easing: DOWN },
    { offset: 10250 / T, transform: pose(1), easing: "linear" },
    ...walk(10800, 5200, -1)
    // 歩いて戻る
  ];
  frames[frames.length - 1].offset = 1;
  const a = fig.animate(frames, { duration: T });
  shadow?.animate([{ transform: "translateY(0) scale(1)" }, { offset: 6e3 / T, transform: `translateY(${FAR * 10}%) scale(${S})` }, { offset: 10800 / T, transform: `translateY(${FAR * 10}%) scale(${S})` }, { transform: "translateY(0) scale(1)" }], { duration: T });
  fig.closest(".pos")?.querySelector(".say")?.classList.remove("on");
  const alive = () => fig.isConnected && a.playState === "running";
  setTimeout(() => {
    if (alive()) face?.({ eye: "round" });
  }, 6600);
  setTimeout(() => {
    if (alive()) face?.({});
  }, 10400);
  return a.finished.catch(() => {
  });
}
function idle(fig, shadow, happy, face = null) {
  const my = live, noise = pink();
  let untilHop = happy ? 1 : 2 + Math.floor(Math.random() * 2), side = 1;
  const breath = () => {
    if (my !== live || !fig.isConnected) return;
    const dur = (happy ? 1600 : 4200) * (1 + 0.18 * noise()), amp = 0.06 * (1 + 0.3 * noise()), lean = 1.6 * side * (1 + 0.4 * noise());
    side = -side;
    const a = fig.animate([{ transform: "rotate(0deg) scale(1,1)", easing: SINE }, { offset: 0.4, transform: `rotate(${lean}deg) scale(${1 - amp * 0.8},${1 + amp})`, easing: SINE }, { transform: "rotate(0deg) scale(1,1)" }], { duration: dur });
    shadow?.animate([{ transform: "scaleX(1)", opacity: 1 }, { offset: 0.4, transform: "scaleX(.96)", opacity: 0.85 }, { transform: "scaleX(1)", opacity: 1 }], { duration: dur });
    a.finished.then(() => {
      if (my !== live) return;
      if (!happy && (app.peekNow || Math.random() < 0.04)) {
        app.peekNow = false;
        app.peekAt = performance.now();
        return approach(fig, shadow, face).then(breath);
      }
      untilHop -= 1;
      if (untilHop > 0) return breath();
      untilHop = happy ? 1 : 2 + Math.floor(Math.random() * 3);
      hopOnce(fig, shadow, happy ? 0.45 : 0.3).then(breath);
    }).catch(() => {
    });
  };
  breath();
}
function brief(line) {
  const parts = String(line ?? "").split(/,\s+|、|[.!?。！？]\s+/).map((x) => x.trim().replace(/[.!?。！？]+$/, "")).filter(Boolean);
  let out = parts[0] ?? "";
  if (parts[1] && (out + ", " + parts[1]).length <= 40) out += ", " + parts[1];
  return out.length > 44 ? out.slice(0, 43).replace(/\s+\S*$/, "") + "\u2026" : out;
}
function sayLines(fold) {
  const out = [];
  if (app.lastSay && !app.lastSayMenu) out.push(app.lastSay);
  for (const x of (fold?.meals ?? []).filter((m) => !m.menu).slice(-3).reverse()) if (x.line && !out.includes(x.line)) out.push(x.line);
  return out;
}
function phraseState() {
  const st = app.st ?? {}, now = Date.now();
  const ev = merged(app.stats, app.did).events ?? [];
  const last = (t) => ev.reduce((m, e) => e.t === t && e.ms > (m?.ms ?? 0) ? e : m, null);
  const meal = last("meal"), out = last("out");
  const outs = app.stats?.did?.[app.did]?.outs ?? [];
  const twist = outs.length ? outs[outs.length - 1]?.facts?.metric ?? null : null;
  const waiting = Object.values(app.deals ?? {}).some((d) => d.st && !d.st.done && ["offered", "locking", "locked", "waiting"].includes(d.st.stage));
  return { s: {
    hour: (new Date()).getHours(),
    hunger: st.hunger,
    mood: st.mood,
    fedAgoMin: meal ? (now - meal.ms) / 6e4 : null,
    homeAgoMin: out ? (now - out.ms) / 6e4 : null,
    twist,
    level: st.accLevel ?? 1,
    waiting
  }, seed: meal?.contract ?? app.did };
}
function nextPhrase(fresh) {
  if (!app.P) return null;
  const { s, seed } = phraseState();
  const day = localDay(Date.now(), app.box), ik = `tama_phr_inv:${app.did}:${day}`;
  let used = 0;
  try {
    used = Number(localStorage.getItem(ik) || 0);
  } catch {
    used = 0;
  }
  app.chatN = (app.chatN ?? 0) + 1;
  const p = pickPhrase(app.P, s, `${seed}:${app.chatN}:${Math.floor(Date.now() / 6e4)}`, { avoid: app.lastPhrase, investLeft: Number(app.P.invest_per_day ?? 2) - used, force: fresh ? "fed" : null });
  if (!p) return null;
  app.lastPhrase = p.id;
  if (p.invest) try {
    localStorage.setItem(ik, String(used + 1));
  } catch {
  }
  return p;
}
function chatter(el, my) {
  if (!el) return;
  const speak = (fresh) => {
    if (my !== live || !el.isConnected) return;
    if (fresh || Math.random() < 0.6) {
      const p = nextPhrase(fresh), lines = app.sayLines ?? [];
      const t = p ? phraseText(p, getLang()) : lines.length ? { short: brief(fresh ? lines[0] : lines[Math.floor(Math.random() * Math.min(lines.length, 3))]), gloss: "", full: "" } : null;
      if (t) {
        el.firstChild.textContent = t.short;
        let g = el.querySelector("small");
        if (t.gloss) {
          if (!g) {
            g = document.createElement("small");
            el.appendChild(g);
          }
          g.textContent = t.gloss;
        } else g?.remove();
        if (t.full && t.full !== t.short) el.title = t.full;
        else el.removeAttribute("title");
        el.classList.add("on");
        setTimeout(() => {
          if (my === live) el.classList.remove("on");
        }, 6e3);
      }
    }
    setTimeout(() => speak(false), 14e3 + Math.random() * 16e3);
  };
  if (app.sayFresh) {
    app.sayFresh = false;
    speak(true);
  } else setTimeout(() => speak(false), 2500 + Math.random() * 5e3);
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
    slot.innerHTML = `<div class="away">${outSign()}<p>${L("\u304A\u3067\u304B\u3051\u4E2D", "Out for a walk")}</p></div>`;
    return;
  }
  const look = kind === "reborn" ? "egg" : grow;
  const fx = kind === "happy" ? `<span class="fx"><i></i><i></i><i></i></span>` : kind === "eat" ? `${bowl()}<span class="fx steam"><i></i><i></i></span>` : kind === "sad" && look === "hako" ? `<span class="fx drop"><i></i></span>` : "";
  slot.innerHTML = `<div class="pos" style="${at(spriteRows(app.did, look, { level: app.st?.accLevel ?? 1 })[0])}"><div class="shadow"></div><div class="hako"></div>${fx}<div class="say"><span></span></div></div>`;
  const fig = slot.querySelector(".hako"), shadow = slot.querySelector(".shadow");
  const frames = FRAMES[kind] ?? FRAMES.normal;
  const level = app.st?.accLevel ?? 1;
  const show = (f) => {
    fig.innerHTML = spriteSvg(app.did, look, HAKO_PX, { level, ...f });
  };
  show(frames[0]);
  const my = live;
  if (look !== "egg") chatter(slot.querySelector(".say"), my);
  if ((kind === "normal" || kind === "happy") && look !== "egg" && !calm() && fig.animate) idle(fig, shadow, kind === "happy", look === "hako" ? show : null);
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
const KIND_EN = { meal: "Feed", out: "Go out", play: "Play" };
function stateWord(st) {
  const k = motionOf(st);
  return { grave: L("\u304A\u5893", "Resting"), out: L("\u304A\u3067\u304B\u3051\u4E2D", "Out"), eat: L("\u98DF\u4E8B\u4E2D", "Eating"), happy: L("\u3054\u304D\u3052\u3093", "Happy"), sad: L("\u3057\u3087\u3093\u307C\u308A", "Down"), reborn: L("\u751F\u307E\u308C\u5909\u308F\u308A", "Reborn") }[k] ?? (st.hunger >= 60 ? L("\u3052\u3093\u304D", "Lively") : L("\u3075\u3064\u3046", "OK"));
}
function lastSay(fold) {
  const meals = fold?.meals ?? [], x = app.lastSay ? { line: app.lastSay, menu: app.lastSayMenu } : meals[meals.length - 1];
  return !x ? null : x.menu ? `Today's meal: ${x.line}` : x.line;
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
function movingNotice() {
  if (!location.hostname.endsWith("github.io")) return;
  let el = $("moving");
  if (!el) {
    el = document.createElement("section");
    el.id = "moving";
    el.className = "card";
    $("view").before(el);
  }
  const h = `<p><b>${L("\u3053\u306E\u5834\u6240\u3067\u306E\u516C\u958B\u306F 10\u67084\u65E5\uFF08\u65E5\uFF0912:00\uFF08\u65E5\u672C\u6642\u9593\uFF09\u3067\u7D42\u308F\u308A\u307E\u3059\u3002", "This page closes on Sunday, October 4, at 12:00 noon Japan time.")}</b></p>
    <p>${L("\u3042\u306A\u305F\u306E HAKO \u3092\u7D9A\u3051\u308B\u306B\u306F\u3001\u305D\u308C\u307E\u3067\u306B\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u65B0\u3057\u3044\u5834\u6240\u3067\u306F\u3001\u305D\u306E\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u7D9A\u3051\u3089\u308C\u307E\u3059\u3002", "To keep your HAKO, save your key file before then. You can load it at the new location to carry on.")}</p>
    ${K.loadRec() ? `<div class="actions"><button class="btn" id="movesave">${L("\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58", "Save key file")}</button></div>` : ""}`;
  if (el.dataset.h === h) return;
  el.innerHTML = h;
  el.dataset.h = h;
  const b = $("movesave");
  if (b) b.onclick = () => {
    const rec = K.loadRec();
    if (rec) {
      K.downloadRec(rec);
      say(L("\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3068\u5225\u306E\u5834\u6240\u306B\u3057\u307E\u3063\u3066\u304F\u3060\u3055\u3044", "Key file saved. Keep it somewhere separate from your passphrase."), false);
    }
  };
}
function render() {
  const view = $("view");
  endSplash();
  renderChrome();
  movingNotice();
  if (!app.did) return renderEgg();
  if (app.stats?.did?.[app.did]?.state?.released) return renderReleased();
  if (!app.priv) return renderUnlock();
  const m = merged(app.stats, app.did);
  const st = lifeState(m.events, Date.now(), app.box);
  app.st = st;
  app.balance = m.balance;
  if (app.why && app.whyAt && Date.now() - app.whyAt > 9e3) app.why = "";
  if (!st.born) return renderEgg();
  const fee = Number(cur().reborn_price ?? 0);
  const graveNote = st.grave ? `<p class="note">` + L(
    `\u304A\u306A\u304B\u304C\u7A7A\u3063\u307D\u306E\u307E\u307E ${app.box.grave_after_hours} \u6642\u9593\u304C\u305F\u3063\u3066\u3001\u304A\u5893\u306B\u306A\u308A\u307E\u3057\u305F\u3002\u751F\u307E\u308C\u5909\u308F\u308B\u3068\u3001\u540C\u3058 HAKO \u304C\u3082\u3046\u4E00\u5EA6\u306F\u3058\u3081\u304B\u3089\u3084\u308A\u76F4\u3057\u307E\u3059\uFF08\u90E8\u5C4B\u3068\u3053\u308C\u307E\u3067\u306E\u8A18\u9332\u306F\u305D\u306E\u307E\u307E\uFF09\u3002` + (fee > 0 ? `\u751F\u307E\u308C\u5909\u308F\u308A\u306B\u306F ${fmt(fee)} $PAPER \u304B\u304B\u308A\u307E\u3059${m.balance < fee ? `\uFF08\u3044\u307E\u306F\u8DB3\u308A\u306A\u3044\u306E\u3067\u3001\u8CA1\u5E03\u304C 0 \u306B\u306A\u3063\u3066\u751F\u307E\u308C\u5909\u308F\u308A\u307E\u3059\uFF09` : ""}\u3002` : "") + `\u304A\u5893\u306E\u9593\u306F\u3001\u304A\u3067\u304B\u3051\u3068\u3042\u305D\u3076\u306F\u3067\u304D\u307E\u305B\u3093\u3002`,
    `Its tummy stayed empty for ${app.box.grave_after_hours} hours, so it is resting in a grave. When it is reborn, the same HAKO starts over from an egg (the room and its record stay). ` + (fee > 0 ? `Rebirth costs ${fmt(fee)} $PAPER${m.balance < fee ? ` (you don't have enough now, so your wallet will go to 0)` : ""}. ` : "") + `While it rests, it can't go out or play.`
  ) + `</p>` : "";
  app.sayLines = st.grave ? [] : sayLines(m.fold);
  const w = $("wallet");
  if (w) {
    w.hidden = false;
    w.textContent = `${fmt(m.balance)} $PAPER${m.fromFold ? "" : " *"}`;
    w.title = m.fromFold ? L("\u8CA1\u5E03", "Wallet") : L("\u5E33\u7C3F\u306B\u8F09\u308B\u307E\u3067\u306E\u898B\u8FBC\u307F", "Estimate until the ledger catches up");
  }
  const acts = actionsHtml(st, m);
  const html = `
    <section class="card" id="me">
      <div id="stage" class="stage"><div class="bg">${roomBg(m, st)}</div><div id="slot"></div><div class="ops mono" id="ops" aria-hidden="true"></div></div>
      ${waitHtml()}
      <div class="who"><span class="name">${nameHtml()}<button type="button" class="rename" id="rename" aria-expanded="${app.naming ? "true" : "false"}" title="${L("HAKO \u306B\u540D\u524D\u3092\u3064\u3051\u308B", "Name your HAKO")}" aria-label="${L("HAKO \u306B\u540D\u524D\u3092\u3064\u3051\u308B", "Name your HAKO")}">\u270E</button></span><span class="chip state"><span class="dot" style="background:${st.grave ? "var(--dim)" : st.hunger >= 60 ? "var(--good)" : st.hunger >= 30 ? "var(--mid)" : "var(--bad)"}"></span>${stateWord(st)}</span></div>
      ${app.naming ? nameForm() : ""}
      ${st.grave ? "" : `<div class="meters">${meter(L("\u304A\u306A\u304B", "Tummy"), st.hunger, app.box.hunger_max)}${meter(L("\u3054\u304D\u3052\u3093", "Mood"), st.mood, app.box.mood_max)}</div>`}
      <div class="chips mono">
        <span class="chip">${L(`\u9023\u7D9A ${st.streak} \u65E5`, `Streak ${st.streak}d`)}</span>
        ${st.grave ? "" : `<span class="chip">${L("\u304A\u3067\u304B\u3051", "Outings")} ${st.outsToday}/${app.box.out_per_day}</span><span class="chip">${L("\u3042\u305D\u3076", "Play")} ${playsToday(m)}/${app.box.play_per_day}</span>`}
        ${st.rebirths ? `<span class="chip">${L("\u751F\u307E\u308C\u5909\u308F\u308A", "Rebirths")} ${st.rebirths}</span>` : ""}
        ${m.fromFold ? "" : `<span class="chip">${L("* \u5E33\u7C3F\u306B\u8F09\u308B\u307E\u3067\u306E\u898B\u8FBC\u307F", "* estimate until the ledger catches up")}</span>`}
      </div>
      ${!st.grave && st.stage !== "hako" && app.box.grow_hours ? `<p class="hint">${L(`${Math.round(app.box.grow_hours / 24)} \u65E5\u80B2\u3066\u308B\u3068\u2026\uFF1F`, `Raise it for ${Math.round(app.box.grow_hours / 24)} days and\u2026?`)}</p>` : ""}
      ${graveNote}
      <div class="actions main">${acts}</div>
      ${app.outCards && !st.grave ? cardsHtml() : ""}
      ${O.available(app.box) ? omakaseHtml(st) + (sitLive().length ? sitHtml(st, m) : "") : sitHtml(st, m)}
      <p id="why" class="why${app.why && app.whyBad ? " bad" : ""}">${esc(app.why ?? "")}</p>
      <div id="said"></div>
      ${roomInfo(m, st)}
    </section>`;
  app.m = m;
  if (app.viewHtml === html && $("stage")) {
    showOps();
    setMotion(motionOf(st));
    renderSaid(m);
    return;
  }
  app.nmFocus = document.activeElement?.id === "nm";
  app.viewHtml = html;
  view.innerHTML = html;
  app.opsShown = null;
  showOps();
  app.motion = null;
  setMotion(motionOf(st));
  for (const b of document.querySelectorAll("#reborn")) b.onclick = reborn;
  const cam = $("snapshot");
  if (cam) cam.onclick = () => snapshot(app.m, app.st);
  wireName();
  wireSit();
  wireOmakase();
  wireCards();
  const sk = $("savekey");
  if (sk) sk.onclick = () => {
    const rec = K.loadRec();
    if (rec) {
      K.downloadRec(rec);
      say(L("\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3068\u5225\u306E\u5834\u6240\u306B\u3057\u307E\u3063\u3066\u304F\u3060\u3055\u3044", "Key file saved. Keep it somewhere separate from your passphrase."), false);
    }
  };
  for (const b of document.querySelectorAll("button[data-kind]")) b.onclick = () => startDeal(b.dataset.kind);
  renderSaid(m);
}
function nameHtml() {
  const rec = K.loadRec(), named = rec?.did === app.did && K.cleanName(rec.name);
  return named ? `${esc(named)} <span class="mono sub">\u2026${esc(app.did.slice(-8))}</span>` : `HAKO <span class="mono">${esc(app.did.slice(-8))}</span>`;
}
function nameForm() {
  return `<form class="namef" id="namef">
      <label>${L("\u540D\u524D", "Name")}<input id="nm" type="text" maxlength="${K.NAME_MAX}" autocomplete="off" placeholder="HAKO \u2026${esc(app.did.slice(-8))}"></label>
      <div class="actions"><button type="submit" class="btn">${L("\u4FDD\u5B58", "Save")}</button><button type="button" class="btn sub" id="nm-cancel">${L("\u3084\u3081\u308B", "Cancel")}</button></div>
      <p class="small">${L(
    `${K.NAME_MAX} \u6587\u5B57\u307E\u3067\u3002\u540D\u524D\u306F\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3068\u9375\u30D5\u30A1\u30A4\u30EB\u306B\u3060\u3051\u4FDD\u5B58\u3055\u308C\u3001\u5EAD\u3084\u307B\u304B\u306E\u4EBA\u306E\u753B\u9762\u306B\u306F\u51FA\u307E\u305B\u3093\u3002\u30B7\u30A7\u30A2\u3059\u308B\u753B\u50CF\u306B\u306F\u51FA\u307E\u3059\u3002\u7A7A\u306B\u3059\u308B\u3068\u5143\u306E\u547C\u3073\u540D\u306B\u623B\u308A\u307E\u3059\u3002\u9375\u30D5\u30A1\u30A4\u30EB\u306B\u3082\u540D\u524D\u3092\u5165\u308C\u308B\u306B\u306F\u3001\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u3082\u3046\u4E00\u5EA6\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,
    `Up to ${K.NAME_MAX} characters. Saved only in this browser and your key file. It won't appear in the garden or on anyone else's screen, but it will show in images you share. Leave it empty to use the default name. To include it in your key file, save the key file again.`
  )}</p>
    </form>`;
}
function wireName() {
  const rn = $("rename");
  if (rn) rn.onclick = () => {
    app.naming = !app.naming;
    app.nameDraft = K.cleanName(K.loadRec()?.name);
    render();
    if (app.naming) $("nm")?.focus();
  };
  const f = $("namef"), nm = $("nm");
  if (!f || !nm) return;
  nm.value = app.nameDraft ?? "";
  if (app.nmFocus) nm.focus();
  nm.oninput = () => {
    app.nameDraft = nm.value;
  };
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const ok = K.setName(nm.value), named = K.cleanName(nm.value);
    app.naming = false;
    app.nameDraft = "";
    say(!ok ? L("\u540D\u524D\u3092\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306B\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "Couldn't save the name in this browser") : named ? L(`\u540D\u524D\u3092\u300C${named}\u300D\u306B\u3057\u307E\u3057\u305F`, `Name set to \u201C${named}\u201D`) : L("\u5143\u306E\u547C\u3073\u540D\u306B\u623B\u3057\u307E\u3057\u305F", "Back to the default name"), !ok);
    render();
  };
  $("nm-cancel").onclick = () => {
    app.naming = false;
    app.nameDraft = "";
    render();
  };
}
const SIT_INDEX = () => `tama_sit_v1:${app.did}`;
function loadSits() {
  let ix = null;
  try {
    ix = JSON.parse(localStorage.getItem(SIT_INDEX()) || "null");
  } catch {
    ix = null;
  }
  return (ix?.slots ?? []).map(newSit);
}
const newSit = (slot) => new SitDeal({ app, slot, onEvent: (ev) => onSit(ev, slotKind(slot)) });
const sitLive = () => app.sits.filter((d) => d.st && !d.st.done);
const sitPlaysMax = (n) => Math.max(0, Math.min(Number(app.box.sit_plays_max ?? 0), Math.floor(Number(app.box.sit_max_slots ?? 99) / n) - 1));
function onSit(ev, kind) {
  if (ev.type === "settled") {
    addLocal(app.did, { t: kind === "sitplay" ? "play" : "meal", ms: ev.ms, contract: ev.contract, sit: true }, ev.delta);
    if (kind === "sit" && ev.lines?.[0]) {
      app.lastSay = ev.lines[0];
      app.lastSayMenu = false;
    }
    logOp(`settled \xB7 ${kind} \xB7 ${short(ev.contract)} \xB7 ${ev.delta} PAPER`);
  } else if (ev.type === "note" && app.sitBooking) {
    app.why = ev.text;
    app.whyBad = false;
    app.whyAt = null;
  }
}
async function tickSits() {
  for (const d of app.sits) {
    await d.tick().catch(() => {
    });
    if (d.st?.locked && d.st.contract && !d.coverNoted) {
      const until = Number(d.st.offer.claimByMs), from = Math.max(Date.now(), d.at() - Number(app.box.sit_cover_hours) * HOUR);
      addLocal(app.did, { t: "sit", ms: Math.min(from, until - 1), until, contract: d.st.contract });
      d.coverNoted = true;
    }
  }
  if (app.sitBooking && !sitPending()) {
    app.sitBooking = false;
    const mine = app.sits.filter((d) => app.sitNew?.has(d.slot) && (d.st?.locked || d.st?.stage === "settled"));
    const ok = mine.filter((d) => d.kind === "sit").length, okp = mine.length - ok;
    app.why = mine.length ? L(`\u30B7\u30C3\u30BF\u30FC\u306B\u304A\u9858\u3044\u3057\u307E\u3057\u305F\uFF08\u3054\u306F\u3093 ${ok} \u56DE${okp ? `\u30FB\u3042\u305D\u3076 ${okp} \u56DE` : ""}\uFF09\u3002\u9589\u3058\u3066\u3082\u5927\u4E08\u592B\u3067\u3059`, `Sitter booked (${ok} meal${ok === 1 ? "" : "s"}${okp ? `, ${okp} play${okp === 1 ? "" : "s"}` : ""}). You can close the page.`) : L("\u304A\u9858\u3044\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002PAPER \u306F\u4F7F\u308F\u308C\u3066\u3044\u307E\u305B\u3093", "Couldn't book the sitter. No PAPER was spent.");
    app.whyBad = !mine.length;
    app.whyAt = Date.now();
  }
}
const sitPending = () => app.sits.some((d) => d.st && !d.st.done && !d.st.locked && !["refunded", "settled"].includes(d.st.stage));
const whenShort = (ms) => new Date(ms).toLocaleString(getLang() === "ja" ? "ja-JP" : "en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
function sitStart() {
  const meals = app.sits.filter((d) => d.kind === "sit" && d.st && !["refunded", "ng", "offer_failed"].includes(d.st.stage)).map((d) => d.at()).filter((t) => t > Date.now());
  return meals.length ? { t0: Math.max(...meals), first: Number(app.box.sit_every_hours), ext: true } : { t0: Date.now(), first: Number(app.box.sit_first_hours ?? app.box.sit_every_hours), ext: false };
}
const sitFits = (n, p, s) => sitSchedule(app.box, s.t0, n, p, s.first).every((x) => !sitWhy(app.box, { job: { context: JSON.stringify({ at: x.at }) }, claimByMs: x.claimByMs, refundAfterMs: x.refundAfterMs }, Date.now()));
function sitHtml(st, m) {
  if (!cur().sit_price) return "";
  const live2 = sitLive();
  if (!app.box.sit_enabled && !live2.length && !(st.sitUntil > Date.now())) return "";
  if (live2.length && sitPending()) return `<div class="sit"><p class="small">${L("\u304A\u9858\u3044\u3057\u3066\u3044\u307E\u3059\u2026\uFF081\u301C2 \u5206\u3002\u3053\u306E\u307E\u307E\u958B\u3044\u3066\u304A\u3044\u3066\u304F\u3060\u3055\u3044\uFF09", "Booking the sitter\u2026 (1\u20132 minutes. Please keep this open.)")}</p></div>`;
  const s = sitStart();
  let head = "";
  if (s.ext || st.sitUntil && st.sitUntil > Date.now()) {
    const ats = app.sits.filter((d) => d.st && !["refunded", "ng", "offer_failed"].includes(d.st.stage)).map((d) => d.at()).filter((t) => t > 0).sort((a, b) => a - b);
    const last = ats.length ? ats[ats.length - 1] : null;
    const done = (d) => d.st?.stage === "settled", cnt = (k, f = () => true) => app.sits.filter((d) => d.kind === k && d.st && !["refunded", "ng", "offer_failed"].includes(d.st.stage) && f(d)).length;
    const nm = cnt("sit"), np = cnt("sitplay"), cm = cnt("sit", done), cp = cnt("sitplay", done);
    head = `<p class="small"><b>${L("\u30B7\u30C3\u30BF\u30FC\u304C\u304A\u4E16\u8A71\u4E2D", "Sitter on duty")}</b>${last ? L(`\uFF08${whenShort(last)} \u307E\u3067\uFF09`, ` (until ${whenShort(last)})`) : ""}\u3000` + L(`\u3054\u306F\u3093 ${cm}/${nm}${np ? `\u30FB\u3042\u305D\u3076 ${cp}/${np}` : ""}`, `meals ${cm}/${nm}${np ? `, plays ${cp}/${np}` : ""}`) + `</p>`;
    const soon = s.ext && s.t0 - Date.now() < Number(app.box.sit_every_hours) * HOUR;
    if (!app.box.sit_enabled || st.grave || !soon) return `<div class="sit">${head}</div>`;
  }
  if (st.grave || !app.box.sit_enabled) return head ? `<div class="sit">${head}</div>` : "";
  const btn = `<div class="actions"><button type="button" class="btn sub" id="sit-open">${s.ext ? L("\u30B7\u30C3\u30BF\u30FC\u3092\u5EF6\u9577", "Extend sitter") : L("\u30B7\u30C3\u30BF\u30FC\u306B\u304A\u9858\u3044", "Ask a sitter")}</button></div>`;
  if (!app.sitOpen) return head ? `<div class="sit">${head}${btn}</div>` : btn;
  const dmax = Array.from({ length: Number(app.box.sit_max_days) }, (_, i) => i + 1).filter((d) => sitFits(d, 0, s)).pop() ?? 0;
  if (!dmax) return `<div class="sit">${head}</div>`;
  const n = Math.min(Math.max(1, Number(app.sitDays ?? Math.min(3, dmax))), dmax);
  const pmax = Math.max(0, ...Array.from({ length: sitPlaysMax(n) + 1 }, (_, j) => j).filter((j) => sitFits(n, j, s)));
  const p = Math.min(Math.max(0, Number(app.sitPlays ?? Math.min(1, pmax))), pmax);
  const price = Number(cur().sit_price), pprice = Number(cur().sit_play_price ?? 0), total = n * (price + p * pprice), lack = m.balance < total;
  const opts = Array.from({ length: dmax }, (_, i) => `<option value="${i + 1}"${i + 1 === n ? " selected" : ""}>${L(`${i + 1} \u65E5`, `${i + 1} day${i ? "s" : ""}`)}</option>`).join("");
  const popts = Array.from({ length: pmax + 1 }, (_, i) => `<option value="${i}"${i === p ? " selected" : ""}>${L(i ? `${i} \u56DE` : "\u3042\u305D\u3070\u306A\u3044", ["None", "Once", "Twice"][i] ?? `${i} times`)}</option>`).join("");
  return `<div class="sit">${head}<form class="sitf" id="sitf">
      <label>${s.ext ? L("\u5EF6\u9577\u3059\u308B\u65E5\u6570", "Extra days") : L("\u7559\u5B88\u306B\u3059\u308B\u65E5\u6570", "Days away")}<select id="sit-days">${opts}</select></label>
      ${pmax ? `<label>${L("1 \u65E5\u306B\u3042\u305D\u3076\u56DE\u6570", "Plays per day")}<select id="sit-plays">${popts}</select></label>` : ""}
      ${lack ? `<p class="why bad">${L("PAPER \u304C\u8DB3\u308A\u307E\u305B\u3093", "Not enough PAPER")}</p>` : ""}
      <div class="actions"><button type="submit" class="btn"${lack ? " disabled" : ""}>${L("\u304A\u9858\u3044\u3059\u308B", "Book")} <span class="price">${fmt(total)} $PAPER</span></button><button type="button" class="btn sub" id="sit-cancel">${L("\u3084\u3081\u308B", "Cancel")}</button></div>
    </form></div>`;
}
function wireSit() {
  const o = $("sit-open");
  if (o) o.onclick = () => {
    app.sitOpen = true;
    render();
  };
  const sel = $("sit-days");
  if (sel) sel.onchange = () => {
    app.sitDays = Number(sel.value);
    render();
  };
  const ps = $("sit-plays");
  if (ps) ps.onchange = () => {
    app.sitPlays = Number(ps.value);
    render();
  };
  const c = $("sit-cancel");
  if (c) c.onclick = () => {
    app.sitOpen = false;
    render();
  };
  const f = $("sitf");
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    bookSit(Number($("sit-days").value), Number($("sit-plays")?.value ?? 0));
  };
}
async function bookSit(n, p = 0) {
  if (sitPending() || app.sitBooking) return;
  const st = app.st, m = app.m;
  if (!st || st.grave) return;
  const s = sitStart();
  p = Math.min(Math.max(0, p), sitPlaysMax(n));
  if (!sitFits(n, p, s)) return say(L("\u305D\u306E\u65E5\u6570\u3067\u306F\u983C\u3081\u307E\u305B\u3093", "That many days can't be booked"));
  if (m.balance < n * (Number(cur().sit_price) + p * Number(cur().sit_play_price ?? 0))) return say(L("PAPER \u304C\u8DB3\u308A\u307E\u305B\u3093", "Not enough PAPER"));
  const plan = sitSchedule(app.box, s.t0, n, p, s.first);
  plan.sort((a, b) => (a.j > 0) - (b.j > 0) || a.at - b.at);
  const slots = plan.map((x) => x.j ? `${s.t0}-${x.k}-p${x.j}` : `${s.t0}-${x.k}`);
  let ix = null;
  try {
    ix = JSON.parse(localStorage.getItem(SIT_INDEX()) || "null");
  } catch {
    ix = null;
  }
  const keep = s.ext ? ix?.slots ?? [] : [];
  try {
    localStorage.setItem(SIT_INDEX(), JSON.stringify({ t0: s.t0, n, p, slots: [...keep, ...slots] }));
  } catch {
  }
  const fresh = slots.map(newSit);
  app.sits = s.ext ? [...app.sits, ...fresh] : fresh;
  app.sitNew = new Set(slots);
  app.sitOpen = false;
  app.sitBooking = true;
  say(L("\u304A\u9858\u3044\u3057\u3066\u3044\u307E\u3059\u2026\uFF081\u301C2 \u5206\u3002\u3053\u306E\u307E\u307E\u958B\u3044\u3066\u304A\u3044\u3066\u304F\u3060\u3055\u3044\uFF09", "Booking the sitter\u2026 (1\u20132 minutes. Please keep this open.)"), false);
  for (let i = 0; i < plan.length; i++) {
    const r = await fresh[i].book({ st, plan: plan[i], t0: s.t0 });
    if (!r.ok) logOp(`${plan[i].kind} \xB7 ${plan[i].k}${plan[i].j ? `-p${plan[i].j}` : ""} \xB7 ${r.why}`);
  }
  render();
}
function omaState() {
  return O.status({ plan: O.loadPlan(app.did), delegates: app.stats?.delegates ?? app.stats?.box?.delegates ?? {}, ownerDid: app.did, ledgerMs: Number(app.stats?.box?.now_ms ?? 0), now: Date.now() });
}
function omakaseHtml(st) {
  if (st.grave && omaState().mode === "off") return "";
  const s = omaState(), cap = O.capDay(cur()), maxD = O.maxDays(app.box);
  if (app.omaBusy) return `<div class="sit"><p class="small">${L("\u624B\u7D9A\u304D\u3092\u3057\u3066\u3044\u307E\u3059\u2026", "Updating\u2026")}</p></div>`;
  if (s.mode === "starting") return `<div class="sit"><p class="small">${s.stop ? L("\u304A\u4EFB\u305B\u3092\u3084\u3081\u308B\u624B\u7D9A\u304D\u304C\u9014\u4E2D\u3067\u6B62\u307E\u308A\u307E\u3057\u305F", "Stopping auto-care didn't finish") : L("\u304A\u4EFB\u305B\u306E\u624B\u7D9A\u304D\u304C\u9014\u4E2D\u3067\u6B62\u307E\u308A\u307E\u3057\u305F", "Auto-care setup didn't finish")}</p>
      <div class="actions"><button type="button" class="btn" id="oma-resume">${L("\u7D9A\u304D\u304B\u3089\u9032\u3081\u308B", "Resume")}</button><button type="button" class="btn sub" id="oma-abandon">${L("\u53D6\u308A\u3084\u3081\u308B", "Cancel")}</button></div></div>`;
  const form = (ext) => {
    const n = Math.min(Math.max(1, Number(app.omaDays ?? Math.min(7, maxD))), maxD);
    const opts = Array.from({ length: maxD }, (_, i) => `<option value="${i + 1}"${i + 1 === n ? " selected" : ""}>${L(`${i + 1} \u65E5`, `${i + 1} day${i ? "s" : ""}`)}</option>`).join("");
    return `<form class="sitf" id="omaf">
      <label>${ext ? L("\u4ECA\u65E5\u304B\u3089\u4F55\u65E5", "Days from today") : L("\u4EFB\u305B\u308B\u65E5\u6570", "How many days")}<select id="oma-days">${opts}</select></label>
      <div class="actions"><button type="submit" class="btn">${ext ? L("\u3053\u306E\u65E5\u6570\u306B\u3059\u308B", "Update") : L("\u59CB\u3081\u308B", "Start")} <span class="price">${L("\u6700\u5927", "max")} ${fmt(cap * n)} $PAPER</span></button><button type="button" class="btn sub" id="oma-back">${L("\u623B\u308B", "Back")}</button></div></form>`;
  };
  if (s.mode === "on") {
    const head = `<p class="small"><b>${L("\u304A\u4EFB\u305B\u4E2D", "Auto-care on")}</b>${L(`\uFF08${whenShort(s.until)} \u307E\u3067\u30FB1 \u65E5 ${fmt(s.cap)} $PAPER \u307E\u3067\uFF09`, ` (until ${whenShort(s.until)}, up to ${fmt(s.cap)} $PAPER/day)`)}</p>`;
    if (app.omaOpen === "ext") return `<div class="sit">${head}${form(true)}</div>`;
    if (app.omaOpen === "stop") return `<div class="sit">${head}<p class="small">${L("\u65B0\u3057\u3044\u6CE8\u6587\u3092\u6B62\u3081\u307E\u3059", "No new orders from now.")}</p>
      <div class="actions"><button type="button" class="btn" id="oma-stop-go">${L("\u3084\u3081\u308B", "Stop")}</button><button type="button" class="btn sub" id="oma-back">${L("\u623B\u308B", "Back")}</button></div></div>`;
    return `<div class="sit">${head}<div class="actions"><button type="button" class="btn sub" id="oma-ext">${L("\u65E5\u6570\u3092\u5909\u3048\u308B", "Change days")}</button><button type="button" class="btn sub" id="oma-stop">${L("\u3084\u3081\u308B", "Stop")}</button></div></div>`;
  }
  if (st.grave) return "";
  if (app.omaOpen === "new") return `<div class="sit">${form(false)}</div>`;
  return `<div class="actions"><button type="button" class="btn sub" id="oma-open">${L("\u304A\u4EFB\u305B\u3092\u59CB\u3081\u308B", "Start auto-care")}</button></div>`;
}
function wireOmakase() {
  const on = (id, f2) => {
    const b = $(id);
    if (b) b.onclick = f2;
  };
  on("oma-open", () => {
    app.omaOpen = "new";
    render();
  });
  on("oma-ext", () => {
    app.omaOpen = "ext";
    render();
  });
  on("oma-stop", () => {
    app.omaOpen = "stop";
    render();
  });
  on("oma-back", () => {
    app.omaOpen = null;
    render();
  });
  on("oma-abandon", () => {
    O.abandon(app.did);
    render();
  });
  on("oma-resume", () => omaGo({}));
  on("oma-stop-go", () => omaGo({ stop: true }));
  const sel = $("oma-days");
  if (sel) sel.onchange = () => {
    app.omaDays = Number(sel.value);
    render();
  };
  const f = $("omaf");
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    omaGo({ days: Number($("oma-days").value) });
  };
}
async function omaGo(want) {
  if (app.omaBusy || !app.priv) return;
  const rec = K.loadRec();
  if (!rec || rec.did !== app.did) return;
  const ext = !want.stop && omaState().mode === "on";
  app.omaBusy = true;
  app.omaOpen = null;
  render();
  const r = await O.run({
    box: { ...app.box, ...cur() },
    ownerDid: app.did,
    ownerPriv: app.priv,
    loadRec: K.loadRec,
    saveRec: K.saveRec,
    now: Date.now(),
    delegates: app.stats?.delegates ?? {},
    ledgerMs: Number(app.stats?.box?.now_ms ?? 0),
    signerOf: (did, priv) => did === app.did ? app.signer : watched(makeSigner(did, priv)),
    post: (sg, room, text) => sg.post(room, text)
  }, want.stop ? { stop: true } : want.days ? { days: want.days } : {});
  app.omaBusy = false;
  if (r.ok) say(want.stop ? L("\u304A\u4EFB\u305B\u3092\u3084\u3081\u307E\u3057\u305F", "Auto-care stopped.") : ext ? L("\u304A\u4EFB\u305B\u306E\u65E5\u6570\u3092\u5909\u3048\u307E\u3057\u305F", "Auto-care updated.") : L("\u304A\u4EFB\u305B\u3092\u59CB\u3081\u307E\u3057\u305F\u3002\u30DA\u30FC\u30B8\u3092\u9589\u3058\u3066\u3082\u7D9A\u304D\u307E\u3059", "Auto-care is on. It keeps going after you close the page."), false);
  else if (r.why === "nothing to resume") say("", false);
  else say(r.why === "not delegated" ? L("\u3044\u307E\u306F\u304A\u4EFB\u305B\u3057\u3066\u3044\u307E\u305B\u3093", "Auto-care is off right now.") : L("\u624B\u7D9A\u304D\u304C\u9014\u4E2D\u3067\u6B62\u307E\u308A\u307E\u3057\u305F\u3002\u300C\u7D9A\u304D\u304B\u3089\u9032\u3081\u308B\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044", "Something went wrong. Tap \u201CResume\u201D to finish."));
  render();
}
function actionsHtml(st, m) {
  const rfee = Math.min(Number(cur().reborn_price ?? 0), Math.max(0, m.balance));
  if (st.grave) return `<button class="btn" id="reborn" style="--c:var(--accent)"><span class="dot" style="background:var(--accent)"></span>${L("\u751F\u307E\u308C\u5909\u308F\u308B", "Be reborn")}${rfee > 0 ? ` <span class="price">${fmt(rfee)} $PAPER</span>` : ""}</button>`;
  const price = { meal: cur().meal_price, out: cur().out_price, play: cur().play_stake };
  return dealKinds.map(([k, label]) => {
    const why = actionBlock(k, st, m);
    return `<button class="btn${why ? " off" : ""}" data-kind="${k}" style="--c:${DOT[k]}" ${why ? `aria-disabled="true" title="${esc(why)}"` : ""}><span class="dot" style="background:${DOT[k]}"></span>${L(label, KIND_EN[k])} <span class="price">${fmt(price[k])} $PAPER</span></button>`;
  }).join("");
}
function applyLang() {
  const en = getLang() === "en";
  document.documentElement.lang = en ? "en" : "ja";
  for (const el of document.querySelectorAll("[data-en]")) {
    if (el.dataset.ja == null) el.dataset.ja = el.textContent;
    el.textContent = en ? el.dataset.en : el.dataset.ja;
  }
  for (const el of document.querySelectorAll("[data-en-label]")) {
    if (el.dataset.jaLabel == null) el.dataset.jaLabel = el.getAttribute("aria-label") ?? "";
    const t = en ? el.dataset.enLabel : el.dataset.jaLabel;
    el.setAttribute("aria-label", t);
    el.title = t;
  }
  const lg = $("lang");
  if (lg) lg.textContent = en ? "JA" : "EN";
}
function renderChrome() {
  if (!document.body.dataset.tabs) {
    document.body.dataset.tabs = "1";
    const TABS = ["me", "garden", "story", "how"];
    const go = (t) => {
      document.body.dataset.tab = t;
      for (const a of document.querySelectorAll("[data-tab-to]")) {
        a.classList.toggle("on", a.dataset.tabTo === t);
        if (t === "me") a.classList.remove("ping");
      }
      window.scrollTo({ top: 0 });
    };
    for (const a of document.querySelectorAll("[data-tab-to]")) a.onclick = (e) => {
      e.preventDefault();
      if (location.hash !== `#${a.dataset.tabTo}`) location.hash = a.dataset.tabTo;
      else go(a.dataset.tabTo);
    };
    addEventListener("hashchange", () => go(TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "me"));
    if (TABS.includes(location.hash.slice(1))) go(location.hash.slice(1));
  }
  const lg = $("lang");
  if (lg && !lg.dataset.done) {
    lg.dataset.done = "1";
    lg.onclick = () => {
      setLang(getLang() === "ja" ? "en" : "ja");
      applyLang();
      app.viewHtml = null;
      app.saidHtml = null;
      render();
    };
    applyLang();
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
  renderGarden(app.stats, app.moods, app.box, app.F);
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
    <div class="chips">${have.map((x) => `<span class="chip">${esc(L(x.ja, x.en ?? x.ja))}</span>`).join("") || `<span class="small">${L("\u307E\u3060\u4F55\u3082\u306A\u3044\u90E8\u5C4B\u3067\u3059", "The room is still empty")}</span>`}</div>
    ${next ? `<p class="small">${L("\u6B21\u306F", "Next:")} <b>${esc(L(next.ja, next.en ?? next.ja))}</b>${L("\uFF08", " (")}${next.when[0] === "stamps" ? `<a href="#zukan" class="tozk">${esc(whenText(next, n))}</a>` : esc(whenText(next, n))}${L("\uFF09", ")")}</p>` : ""}
    ${footprintsHtml(m)}
    <div class="actions">
      <button class="btn sub" id="snapshot">${L("HAKO \u3092\u30B7\u30A7\u30A2", "Share HAKO")}</button>
      <button class="btn sub" id="savekey">${L("\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58", "Save key file")}</button>
    </div></div>`;
}
function noticeVisitors() {
  if (!app.did || !app.stats) return;
  const key = `tama_seen_steps_v1:${app.did}`, v = merged(app.stats, app.did).fold?.visitors ?? [];
  let seen = 0;
  try {
    seen = Number(localStorage.getItem(key) ?? 0);
  } catch {
    seen = 0;
  }
  const fresh = v.filter((x) => x.ms > Math.max(seen, Date.now() - 7 * 864e5));
  if (!v.length) return;
  try {
    localStorage.setItem(key, String(v.at(-1).ms));
  } catch {
  }
  if (!fresh.length || app.why) return;
  const who = [...new Set(fresh.map((x) => `HAKO \u2026${x.from.slice(-4)}`))];
  say(who.length === 1 ? L(`${who[0]} \u304C\u304A\u5EAD\u306B\u6765\u307E\u3057\u305F`, `${who[0]} visited your garden`) : L(`${who[0]} \u307B\u304B ${who.length - 1} \u5339\u304C\u304A\u5EAD\u306B\u6765\u307E\u3057\u305F`, `${who[0]} and ${who.length - 1} more visited your garden`), false);
}
function noticeRefill() {
  if (!app.did || !app.stats) return;
  const key = `tama_seen_refill_v1:${app.did}`, v = merged(app.stats, app.did).fold?.refills ?? [];
  if (!v.length) return;
  let seen = 0;
  try {
    seen = Number(localStorage.getItem(key) ?? 0);
  } catch {
    seen = 0;
  }
  const last = v.at(-1);
  try {
    localStorage.setItem(key, String(last.ms));
  } catch {
  }
  if (last.ms <= Math.max(seen, Date.now() - 7 * 864e5) || app.why) return;
  const to = fmt(boxAt(app.box, last.ms).initial_paper);
  say(L(`PAPER \u304C ${to} \u307E\u3067\u88DC\u5145\u3055\u308C\u307E\u3057\u305F`, `Your PAPER was topped up to ${to}`), false);
}
function footprintsHtml(m) {
  const since = Date.now() - 7 * 864e5, seen = new Set();
  const v = [...m.fold?.visitors ?? []].reverse().filter((x) => x.ms >= since && !seen.has(x.from) && seen.add(x.from)).slice(0, 8);
  if (!v.length) return "";
  return `<p class="label" style="margin-top:12px">${L("\u8DB3\u3042\u3068", "Footprints")}</p><div class="steps">${v.map((x) => `<span class="step" title="${esc(`HAKO \u2026${x.from.slice(-4)} \xB7 ${whenShort(x.ms)}`)}">${faceSvg(x.from, 2)}<span class="id">\u2026${esc(x.from.slice(-4))}</span></span>`).join("")}</div>`;
}
async function snapshot(m, st) {
  const n = lifetime(m.events, app.box, localDay);
  const art = st.grave ? null : app.lastArticle ?? (m.fold?.outs ?? []).slice(-1)[0] ?? null;
  const said = st.grave ? "Here lies a happy little HAKO. It will be back." : lastSay(m.fold);
  const title = K.nameOf(K.loadRec(), app.did);
  const stage = $("stage");
  if (stage) {
    stage.classList.remove("flash");
    void stage.offsetWidth;
    stage.classList.add("flash");
  }
  try {
    const png = await svgToPng(scrapSvg(app.F, app.did, n, title, {
      stage: st.stage,
      level: st.accLevel ?? 1,
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
    const text = st.grave ? L(`${title} \u306F\u304A\u5893\u3067\u4F11\u3093\u3067\u3044\u307E\u3059 #HAKONIWA`, `${title} is resting in its grave #HAKONIWA`) : art ? L(`${title} \u306E\u304A\u3067\u304B\u3051\u8A18\u4E8B #HAKONIWA`, `${title}'s outing report #HAKONIWA`) : L(`${title} \u306E\u90E8\u5C4B #HAKONIWA`, `${title}'s room #HAKONIWA`);
    const src = URL.createObjectURL(file);
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    document.getElementById("snap")?.remove();
    const box = document.createElement("div");
    box.className = "snap";
    box.id = "snap";
    box.innerHTML = `<div class="photo"><img src="${src}" alt="${esc(L(`${title} \u306E\u90E8\u5C4B\u306E\u5199\u771F`, `A photo of ${title}'s room`))}"><p class="mono">${esc(title)}</p></div>
      <div class="actions"><button class="btn" id="snap-share" style="--c:var(--accent)">${L("\u30B7\u30A7\u30A2\u3059\u308B", "Share")}</button><a class="btn sub" id="snap-save" href="${src}" download="${file.name}">${L("\u753B\u50CF\u3092\u4FDD\u5B58", "Save image")}</a><button class="btn sub" id="snap-close">${L("\u3068\u3058\u308B", "Close")}</button></div>`;
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
    app.why = L(`\u753B\u50CF\u3092\u4F5C\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`, `Couldn't make the image (${e.message})`);
    render();
  }
}
function playsToday(m) {
  const today = localDay(Date.now(), app.box);
  const done = m.events.filter((e) => e.t === "play" && !e.sit && localDay(e.ms, app.box) === today).length;
  const live2 = app.deals.play?.busy() ? 1 : 0;
  return done + live2;
}
function actionBlock(kind, st, m) {
  const x = app.deals[kind];
  if (x?.busy()) return x.st.gaveUp ? L("PAPER \u304C\u623B\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059", "Waiting for the PAPER to come back") : L("\u3044\u307E\u306F\u305D\u306E\u9014\u4E2D\u3067\u3059", "Already in progress");
  const price = { meal: cur().meal_price, out: cur().out_price, play: cur().play_stake }[kind];
  if (st.grave) return L("\u304A\u5893\u306E\u9593\u306F\u3067\u304D\u307E\u305B\u3093", "Not while it rests in the grave");
  if (m.balance < Number(price)) return L("PAPER \u304C\u8DB3\u308A\u307E\u305B\u3093", "Not enough PAPER");
  if (kind === "out" && st.outsToday >= Number(app.box.out_per_day)) return L(`\u304A\u3067\u304B\u3051\u306F 1 \u65E5 ${app.box.out_per_day} \u56DE\u307E\u3067\u3067\u3059`, `Outings are limited to ${app.box.out_per_day} a day`);
  if (kind === "out" && st.hunger < Number(app.box.out_min_hunger ?? 0)) return L(`\u304A\u306A\u304B\u304C ${app.box.out_min_hunger} \u4EE5\u4E0A\u306A\u3044\u3068\u3001\u304A\u3067\u304B\u3051\u3067\u304D\u307E\u305B\u3093`, `It needs a tummy of ${app.box.out_min_hunger} or more to go out`);
  if (kind === "play" && playsToday(m) >= Number(app.box.play_per_day ?? Infinity)) return L(`\u3042\u305D\u3076\u306F 1 \u65E5 ${app.box.play_per_day} \u56DE\u307E\u3067\u3067\u3059`, `Play is limited to ${app.box.play_per_day} a day`);
  if (kind === "play" && !(app.box.npcs ?? []).length) return L("\u3042\u305D\u3073\u76F8\u624B\u304C\u307E\u3060\u3044\u307E\u305B\u3093", "No playmates yet");
  return null;
}
function renderSaid(m) {
  const el = $("said");
  if (!el) return;
  const fold = m?.fold;
  const today = localDay(Date.now(), app.box);
  const plays = (m?.events ?? []).filter((e) => e.t === "play" && !e.sit && e.payout != null && localDay(e.ms, app.box) === today).sort((a, b) => b.ms - a.ms);
  const hm = (ms) => new Date(ms).toLocaleTimeString(getLang() === "ja" ? "ja-JP" : "en-US", { hour: "2-digit", minute: "2-digit" });
  let outs = (fold?.outs ?? []).slice(-1);
  if (app.lastArticle && !(fold?.outs ?? []).some((o) => o.contract === app.lastArticle.contract)) outs = [app.lastArticle];
  const h = [
    ...outs.map((o) => `<details class="article" data-c="${esc(o.contract ?? "")}"${app.articleOpen === o.contract ? " open" : ""}><summary><h3>${esc(o.lines[0] ?? "")}</h3><span class="more"><span class="rd">${L("\u8A18\u4E8B\u3092\u8AAD\u3080 \u25BE", "Read the report \u25BE")}</span><span class="cl">${L("\u9589\u3058\u308B \u25B4", "Close \u25B4")}</span></span></summary>
      ${o.day || o.dest ? `<p class="meta mono">${[o.day ? esc(o.day) : "", o.dest ? esc(destName(o.dest)) : "", o.nth ? L(`\u4ECA\u65E5 ${o.nth} \u56DE\u76EE`, `#${o.nth} today`) : ""].filter(Boolean).join(" \xB7 ")}</p>` : ""}${o.lines.slice(1).map((l) => `<p>${esc(l)}</p>`).join("")}${o.contract ? dealLink(o.contract) : ""}</details>`),
    ...plays.length ? [`<p class="label" style="margin-top:12px">${L("\u4ECA\u65E5\u306E\u3042\u305D\u3076", "Today's plays")}</p><ul class="menu">${plays.map((e) => {
      const stake = Number(e.price ?? cur().play_stake), back = Number(e.payout), d = back - stake;
      return `<li><span class="mono">${hm(e.ms)}</span>\u3000${fmt(stake)} \u2192 ${fmt(back)} $PAPER <span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${fmt(d)}</span></li>`;
    }).join("")}</ul>`] : [],
    passbookHtml(m, outs[0]?.contract ?? null)
  ].join("");
  if (app.saidHtml !== h || h && !el.firstChild) {
    el.innerHTML = h;
    app.saidHtml = h;
    for (const d of el.querySelectorAll("details.article")) d.ontoggle = () => {
      app.articleOpen = d.open ? d.dataset.c : null;
      app.saidHtml = null;
    };
    for (const d of el.querySelectorAll("details.rows")) d.ontoggle = () => {
      app.bookOpen = d.open;
      app.saidHtml = null;
    };
    for (const b of el.querySelectorAll("button.totop")) b.onclick = () => {
      const a = el.querySelector("details.article");
      if (!a) return;
      a.open = true;
      a.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    };
  }
}
const dealHref = (contract) => `${String(app.box.venue ?? "https://technocore.chat").replace(/\/+$/, "")}/r/mb-p-tclk-${String(contract).slice(2, 18)}`;
const dealLink = (contract) => `<a class="mono tx" href="${esc(dealHref(contract))}" target="_blank" rel="noopener" title="${esc(L(`Technocore \u3067\u53D6\u5F15\u3092\u898B\u308B\uFF08${contract}\uFF09`, `View this deal on Technocore (${contract})`))}">${L("\u53D6\u5F15\u3092\u898B\u308B", "View deal")} \u2197</a>`;
const monthDay = (ms) => new Date(ms).toLocaleDateString(getLang() === "ja" ? "ja-JP" : "en-US", { month: "numeric", day: "numeric" });
function passbookHtml(m, top) {
  const outs = [...m?.fold?.outs ?? []].reverse();
  const zk = zukanHtml(m);
  if (!outs.length && !zk) return "";
  const hm = (ms) => new Date(ms).toLocaleTimeString(getLang() === "ja" ? "ja-JP" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const row = (o) => {
    const price = Number(boxAt(app.box, o.lock_ms ?? o.ms).out_price);
    const art = !o.dest || o.dest.kind === "town" ? TOWN_SVG : faceSvg(o.dest.to, 2);
    const head = `<span class="mono when">${esc(hm(o.ms))}</span><span class="art">${art}</span><span class="where"><span class="nm">${esc(o.dest ? destName(o.dest) : L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore"))}</span>${o.auto ? `<span class="auto">${L("\u304A\u4EFB\u305B", "Auto-care")}</span>` : ""}</span>
      <span class="mono amt">${o.contract === top ? "\u2191 " : ""}\u2212${fmt(price)} $PAPER</span>`;
    if (o.contract === top) return `<li><button type="button" class="totop" aria-label="${esc(L("\u4E0A\u306E\u8A18\u4E8B\u3092\u958B\u304F", "Open the report above"))}">${head}</button></li>`;
    return `<li><details><summary>${head}</summary>
      <div class="memo">${(o.lines ?? []).map((l, i) => i ? `<p>${esc(l)}</p>` : `<p><b>${esc(l)}</b></p>`).join("")}${dealLink(o.contract)}</div></details></li>`;
  };
  let day = null;
  const items = [];
  for (const o of outs) {
    const d = monthDay(o.ms);
    if (d !== day) {
      items.push(`<li class="day mono">${esc(d)}</li>`);
      day = d;
    }
    items.push(row(o));
  }
  return `<div class="passbook">${zk}${outs.length ? `<details class="rows"${app.bookOpen ? " open" : ""}><summary>${L(`\u3053\u308C\u307E\u3067\u306E ${outs.length} \u56DE`, `Outings so far (${outs.length})`)}</summary>
    <ul class="book">${items.join("")}</ul></details>` : ""}</div>`;
}
function stampSeq(events) {
  const seq = [];
  for (const e of [...events].sort((a, b) => a.ms - b.ms)) {
    if (e.t === "join" && !seq.some((x) => x.kind === "welcome")) for (let i = 0; i < STAMP_WELCOME; i++) seq.push({ kind: "welcome", to: app.did, ms: e.ms });
    else if (e.t === "out") seq.push({ kind: e.dest?.kind ?? "town", to: e.dest?.to ?? null, ms: e.ms });
  }
  return seq;
}
const INK = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="ink0" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 2.25" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="ink"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="11" result="w"/><feDisplacementMap in="ink" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="ink1" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="17" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 2.2" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="ink"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="23" result="w"/><feDisplacementMap in="ink" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="ink2" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="29" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 2.3" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="ink"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="31" result="w"/><feDisplacementMap in="ink" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="ink3" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="41" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 2.15" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="ink"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="43" result="w"/><feDisplacementMap in="ink" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>`;
const hanko = (x, i, isNew) => `<span class="hk${isNew ? " new" : ""}" style="--r:${i * 37 % 17 - 8}deg;filter:url(#ink${i % 4})" title="${esc(x.kind === "welcome" ? L("\u306F\u3058\u3081\u306E\u30B9\u30BF\u30F3\u30D7", "Welcome stamp") : `${destName(x)} \xB7 ${monthDay(x.ms)}`)}"><span class="st">${x.kind === "town" ? TOWN_SVG : faceSvg(x.to, 2)}</span></span>`;
function zukanHtml(m) {
  if (!app.did || !visitsOn() || !app.F) return "";
  const b = stampBook(app.box, app.did, app.stats?.slots?.in ?? [], stamps(m?.events ?? []));
  const have = b.now.filter((x) => x.n > 0).length;
  const seq = stampSeq(m?.events ?? []);
  const wreath = welcomeCounts(m?.events ?? []) ? null : app.F.items.find((it2) => it2.key === "wreath");
  const life = lifetime(m?.events ?? [], app.box, localDay);
  const cards = [
    ...wreath ? [{ ...wreath, when: ["stamps", STAMP_WELCOME] }] : [],
    ...app.F.items.filter((it2) => it2.when[0] === "stamps" && (life.stamps >= it2.when[1] || !hasItem(it2, life))).sort((a, c) => a.when[1] - c.when[1]).map((it2) => ({ ...it2, when: ["stamps", it2.when[1] + (wreath ? STAMP_WELCOME : 0)] }))
  ];
  const seenKey2 = `tama_seen_card_v1:${app.did}`;
  let seen = app.cardSeen;
  if (seen == null) {
    try {
      const v = localStorage.getItem(seenKey2);
      seen = v == null ? 0 : Number(v) || 0;
    } catch {
      seen = 0;
    }
  }
  const fresh = seen < seq.length, at = fresh ? seq.length - 1 : seq.length;
  let k = cards.findIndex((it2) => at < it2.when[1]);
  if (k < 0) k = cards.length - 1;
  if (fresh && !app.cardTimer) app.cardTimer = setTimeout(() => {
    app.cardTimer = null;
    app.cardSeen = seq.length;
    try {
      localStorage.setItem(seenKey2, String(seq.length));
    } catch {
    }
    app.saidHtml = null;
    render();
  }, 1600);
  const from = k ? cards[k - 1].when[1] : 0, to = cards[k].when[1], it = cards[k];
  const cells = [];
  for (let i = from; i < to; i++) {
    const prize = i === to - 1 ? `<span class="pz">${artSvg(it.art, app.F.palette, "css")}</span>` : "";
    const stamped = i < seq.length;
    cells.push(`<span class="sc${prize ? " prize" : stamped ? "" : " empty"}${prize && stamped ? " full" : ""}">${prize}${stamped ? hanko(seq[i], i, i >= seen) : ""}</span>`);
  }
  return `<p class="label" id="zukan" style="margin-top:16px">${L(`\u304A\u3067\u304B\u3051\u5E33\u3000\u5834\u6240 ${have} / ${b.now.length}`, `Outing log \xB7 places ${have} / ${b.now.length}`)}</p>
    <div class="scard"><p class="sc-head"><b>${esc(L(it.ja, it.en ?? it.ja))}</b><span class="mono">${Math.min(seq.length, to) - from} / ${to - from}</span></p><div class="sc-cells">${cells.join("")}</div>${INK}</div>`;
}
function stampState() {
  const m = merged(app.stats, app.did);
  const places = Object.keys(stamps(m?.events ?? []));
  const furn = app.F ? unlocked(app.F, lifetime(m?.events ?? [], app.box, localDay)).map((it) => it.key) : [];
  return { places, furn };
}
function stampLine(before, after) {
  const np = after.places.filter((p) => !before.places.includes(p)), nf = after.furn.filter((k) => !before.furn.includes(k));
  const kindName = (p) => p === "town" ? L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore") : p.startsWith("npc:") ? L("\u3042\u305D\u3073\u5834", "Playhouse") : L("\u304A\u5EAD", "Garden");
  const items = nf.map((k) => app.F.items.find((it) => it.key === k)).filter(Boolean).map((it) => L(it.ja, it.en ?? it.ja));
  const sp = !np.length ? "" : np.length === 1 ? L(`${kindName(np[0])}\u306E\u30B9\u30BF\u30F3\u30D7\u3092\u62BC\u3057\u307E\u3057\u305F`, `Stamped: ${kindName(np[0])}`) : L(`\u30B9\u30BF\u30F3\u30D7\u3092 ${np.length} \u3064\u62BC\u3057\u307E\u3057\u305F`, `Stamped: ${np.length} places`);
  const fu = !items.length ? "" : items.length === 1 ? L(`${items[0]}\u304C\u5C4A\u304D\u307E\u3057\u305F`, `The ${items[0].toLowerCase()} has arrived`) : items.length === 2 ? L(`${items[0]}\u3068${items[1]}\u304C\u5C4A\u304D\u307E\u3057\u305F`, `The ${items[0].toLowerCase()} and ${items[1].toLowerCase()} have arrived`) : L(`${items[0]}\u307B\u304B ${items.length - 1} \u3064\u304C\u5C4A\u304D\u307E\u3057\u305F`, `The ${items[0].toLowerCase()} and ${items.length - 1} more have arrived`);
  return [sp, fu].filter(Boolean).join(L("\u3002", ". "));
}
const seenKey = () => `tama_seen_stamps_v1:${app.did}`;
function saveSeen(st) {
  try {
    localStorage.setItem(seenKey(), JSON.stringify(st));
  } catch {
  }
}
function noticeStamps() {
  if (!app.did || !app.stats || !app.F) return;
  const now = stampState();
  let seen = null;
  try {
    seen = JSON.parse(localStorage.getItem(seenKey()) ?? "null");
  } catch {
    seen = null;
  }
  saveSeen(now);
  if (!seen || app.why) return;
  const line = stampLine({ places: seen.places ?? [], furn: seen.furn ?? [] }, now);
  if (line) say(line, false);
}
function renderReleased() {
  const h = `
    <section class="card" id="me">
      <div class="stage plain short"><div class="egg">${spriteSvg(null, "egg", 5)}</div></div>
      <h2>${L("\u3053\u306E HAKO \u306F\u7BB1\u5EAD\u3092\u96E2\u308C\u307E\u3057\u305F", "This HAKO has left the garden")}</h2>
      <div class="actions"><button class="btn" id="anew">${L("\u65B0\u3057\u3044 HAKO \u3092\u8FCE\u3048\u308B", "Welcome a new HAKO")}</button></div>
    </section>`;
  if (app.viewHtml === h) return;
  $("view").innerHTML = h;
  app.viewHtml = h;
  $("anew").onclick = () => {
    if (!confirm(L("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u304B\u3089\u4ECA\u306E\u9375\u3092\u6D88\u3057\u3066\u3001\u65B0\u3057\u3044 HAKO \u3092\u8FCE\u3048\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F", "This removes the current key from this browser and welcomes a new HAKO. Continue?"))) return;
    K.dropRec();
    app.did = null;
    app.priv = null;
    app.signer = null;
    app.viewHtml = null;
    render();
  };
}
const isFull = () => app.box.max_hakos != null && Number(app.stats?.box?.hakos ?? 0) >= Number(app.box.max_hakos);
const isClosing = () => location.hostname.endsWith("github.io");
function renderEgg() {
  if (!app.did && (isFull() || isClosing())) {
    $("view").innerHTML = `
    <section class="card" id="me">
      <div class="stage plain short"><div class="egg">${spriteSvg(null, "egg", 5)}</div></div>
      <p class="label" style="margin-top:14px">NEW HAKO</p>
      ${isClosing() ? `<h2>${L("\u3053\u3053\u3067\u306F\u65B0\u3057\u3044 HAKO \u3092\u8FCE\u3048\u3066\u3044\u307E\u305B\u3093", "No new HAKOs here")}</h2>` : `<h2>${L("\u3044\u307E\u306F\u6E80\u54E1\u3067\u3059", "We're full right now")}</h2>
      <p>${L("\u65B0\u3057\u3044 HAKO \u306F\u3001\u7A7A\u304D\u304C\u51FA\u308B\u307E\u3067\u8FCE\u3048\u3089\u308C\u307E\u305B\u3093\u3002", "New HAKOs can't be welcomed until there's room.")}</p>`}
      <p class="small">${L("\u9375\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308B\u3068\u304D\u306F", "Have a key file?")} <label class="link">${L("\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3080", "Load it from a file")}<input id="file" type="file" accept="application/json" hidden></label></p>
    </section>`;
    $("file").onchange = importKey;
    return;
  }
  $("view").innerHTML = `
    <section class="card" id="me">
      <div class="stage plain short"><div class="egg">${spriteSvg(null, "egg", 5)}</div></div>
      <p class="label" style="margin-top:14px">NEW HAKO</p>
      <h2>${L("HAKO \u3092\u8FCE\u3048\u308B", "Welcome a HAKO")}</h2>
      <p>${L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3092\u6C7A\u3081\u308B\u3068\u3001HAKO \u304C\u751F\u307E\u308C\u307E\u3059\u3002\u751F\u307E\u308C\u305F\u3089\u300E\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u300F\u3092\u62BC\u3057\u3066\u304A\u3044\u3066\u304F\u3060\u3055\u3044\u3002\u9375\u304C\u306A\u3044\u3068\u3001HAKO \u306B\u4F1A\u3048\u306A\u304F\u306A\u308A\u307E\u3059\u3002", `Choose a passphrase and your HAKO will be born. Once it's born, tap "Save key file". Without the key, you can't get back to your HAKO.`)}</p>
      <p class="note">${L(`\u306F\u3058\u3081\u306E\u304A\u3053\u3065\u304B\u3044 ${fmt(cur().initial_paper)} PAPER`, `Starting allowance: ${fmt(cur().initial_paper)} PAPER`)}</p>
      <form class="keyf" id="kf" method="post" action="#">
      <input class="vh" id="u1" name="username" type="text" autocomplete="username" tabindex="-1" aria-hidden="true" value="">
      <label>${L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\uFF08HAKO \u3092\u8D77\u3053\u3059\u3068\u304D\u306B\u4F7F\u3044\u307E\u3059\uFF09", "Passphrase (to wake your HAKO)")}<span class="pw"><input id="p1" name="password" type="password" autocomplete="new-password"><button type="button" class="eye" data-eye="p1,p2"></button></span></label>
      <label>${L("\u3082\u3046\u4E00\u5EA6", "Once more")}<span class="pw"><input id="p2" name="password2" type="password" autocomplete="new-password"></span></label>
      <p class="small">${L("\u30D6\u30E9\u30A6\u30B6\u306B\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u4FDD\u5B58\u3092\u3059\u3059\u3081\u3089\u308C\u305F\u3089\u3001\u4FDD\u5B58\u3059\u308B\u3068\u6B21\u304B\u3089\u81EA\u52D5\u3067\u5165\u529B\u3055\u308C\u307E\u3059\u3002\u5171\u7528\u306E\u7AEF\u672B\u3067\u306F\u4FDD\u5B58\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002", "If your browser offers to save it, you can, and it will fill in next time. Don't save it on a shared device.")}</p>
      <p id="why" class="why"></p>
      <div class="actions"><button type="submit" class="btn" id="born" style="--c:var(--good)"><span class="dot" style="background:var(--good)"></span>${L("\u751F\u307E\u308C\u308B", "Be born")}</button></div>
      </form>
      <p class="small">${L("\u9375\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308B\u3068\u304D\u306F", "Have a key file?")} <label class="link">${L("\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3080", "Load it from a file")}<input id="file" type="file" accept="application/json" hidden></label></p>
    </section>`;
  eyes();
  $("kf").onsubmit = (e) => {
    e.preventDefault();
    register();
  };
  $("file").onchange = importKey;
}
function eyes() {
  for (const b of document.querySelectorAll("[data-eye]")) b.onclick = () => {
    b.dataset.on = b.dataset.on === "1" ? "" : "1";
    for (const id of b.dataset.eye.split(",")) {
      const el = $(id);
      if (el) el.type = b.dataset.on ? "text" : "password";
    }
    label(b);
  };
  const label = (b) => {
    b.textContent = b.dataset.on ? L("\u96A0\u3059", "Hide") : L("\u8868\u793A", "Show");
    b.setAttribute("aria-label", b.dataset.on ? L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3092\u96A0\u3059", "Hide passphrase") : L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3092\u8868\u793A\u3059\u308B", "Show passphrase"));
  };
  for (const b of document.querySelectorAll("[data-eye]")) label(b);
}
function sleeping() {
  let st = null;
  try {
    st = lifeState(merged(app.stats, app.did).events, Date.now(), app.box);
  } catch {
    st = null;
  }
  return spriteSvg(app.did, st?.born ? st.grave ? "ghost" : st.stage : "egg", 6, { eye: "line", level: st?.accLevel ?? 1 });
}
function renderUnlock() {
  $("view").innerHTML = `
    <section class="card" id="me">
      <div class="stage plain">${app.did ? `<div class="hako">${sleeping()}</div>` : ""}</div>
      <p>${L(`${esc(K.nameOf(K.loadRec(), app.did))} \u304C\u7720\u3063\u3066\u3044\u307E\u3059\u3002\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u3092\u5165\u308C\u308B\u3068\u8D77\u304D\u307E\u3059\u3002`, `${esc(K.nameOf(K.loadRec(), app.did))} is asleep. Enter your passphrase to wake it.`)}</p>
      <form class="keyf" id="kf" method="post" action="#">
      <input class="vh" name="username" type="text" autocomplete="username" tabindex="-1" aria-hidden="true" value="${esc(K.loginName(app.did))}" readonly>
      <label>${L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA", "Passphrase")}<span class="pw"><input id="p1" name="password" type="password" autocomplete="current-password"><button type="button" class="eye" data-eye="p1"></button></span></label>
      <p class="small">${L("\u30D6\u30E9\u30A6\u30B6\u306B\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u4FDD\u5B58\u3092\u3059\u3059\u3081\u3089\u308C\u305F\u3089\u3001\u4FDD\u5B58\u3059\u308B\u3068\u6B21\u304B\u3089\u81EA\u52D5\u3067\u5165\u529B\u3055\u308C\u307E\u3059\u3002\u5171\u7528\u306E\u7AEF\u672B\u3067\u306F\u4FDD\u5B58\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002", "If your browser offers to save it, you can, and it will fill in next time. Don't save it on a shared device.")}</p>
      <p id="why" class="why"></p>
      <div class="actions"><button type="submit" class="btn" id="open">${L("HAKO \u3092\u8D77\u3053\u3059", "Wake HAKO")}</button></div>
      <label class="small"><input id="tab" type="checkbox" checked> ${L("\u3053\u306E\u30BF\u30D6\u3092\u9589\u3058\u308B\u307E\u3067\u8D77\u3053\u3057\u305F\u307E\u307E\u306B\u3059\u308B\uFF08\u958B\u3044\u3066\u3044\u308B\u307B\u304B\u306E\u30BF\u30D6\u3067\u3082\u3001\u5165\u308C\u76F4\u3055\u305A\u306B\u4F7F\u3048\u307E\u3059\uFF09", "Keep awake until this tab is closed (works in your other open tabs too)")}</label>
      </form>
    </section>`;
  eyes();
  $("kf").onsubmit = (e) => {
    e.preventDefault();
    unlock();
  };
}
const say = (s, bad = true) => {
  app.why = s;
  app.whyBad = !!s && bad;
  app.whyAt = Date.now();
  const w = $("why");
  if (!w) return;
  w.textContent = s;
  w.classList.toggle("bad", !!s && bad);
  if (s) w.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
};
async function register() {
  const p1 = $("p1").value, p2 = $("p2").value;
  if (p1.length < 12) return say(L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u306F 12 \u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044", "Use a passphrase of 12 characters or more"));
  if (p1 !== p2) return say(L("2 \u3064\u306E\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u304C\u9055\u3044\u307E\u3059", "The two passphrases don't match"));
  if (isClosing()) return say(L("\u3053\u3053\u3067\u306F\u65B0\u3057\u3044 HAKO \u3092\u8FCE\u3048\u3066\u3044\u307E\u305B\u3093", "No new HAKOs here"));
  if (isFull()) return say(L("\u3044\u307E\u306F\u6E80\u54E1\u3067\u3059", "We're full right now"));
  if (!await K.supported()) return say(L("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F Ed25519 \u306E\u9375\u3092\u4F5C\u308C\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u30D6\u30E9\u30A6\u30B6\u3067\u958B\u3044\u3066\u304F\u3060\u3055\u3044", "This browser can't make an Ed25519 key. Please open it in a newer browser."));
  say(L("\u9375\u3092\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026", "Making your key\u2026"), false);
  const { priv, did, rec } = await K.makeKey(p1);
  K.saveRec(rec);
  await K.rememberTab(priv, did);
  const u = $("u1");
  if (u) u.value = K.loginName(did);
  app.did = did;
  app.priv = priv;
  app.signer = watched(makeSigner(did, priv));
  try {
    await app.signer.post(app.box.board, tamaLine({ t: "join", v: 1, n: rand() }));
  } catch (e) {
    say(L(`\u63B2\u793A\u677F\u306B\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09\u3002\u3082\u3046\u4E00\u5EA6\u62BC\u3057\u3066\u304F\u3060\u3055\u3044`, `Couldn't post to the board (${e.message}). Please press again.`));
    return;
  }
  addLocal(did, { t: "join", ms: Date.now() });
  K.offerSave(did, p1);
  K.downloadRec(rec);
  app.rebornUntil = Date.now() + 2500;
  setTimeout(render, 2600);
  await boot();
}
async function importKey(ev) {
  try {
    const j = JSON.parse(await ev.target.files[0].text());
    if (!K.isKeyFile(j)) return say(L("\u9375\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093", "That is not a key file"));
    const cur2 = K.loadRec();
    if (cur2 && cur2.did !== j.did && !confirm(L(`\u4ECA\u306E ${K.nameOf(cur2, cur2.did)} \u306E\u9375\u3092\u3001\u8AAD\u307F\u8FBC\u3093\u3060\u9375\u3067\u7F6E\u304D\u63DB\u3048\u307E\u3059\u3002\u4ECA\u306E\u9375\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3057\u3066\u3044\u306A\u3044\u3068\u3001\u4ECA\u306E HAKO \u306B\u306F\u623B\u308C\u307E\u305B\u3093\u3002\u7F6E\u304D\u63DB\u3048\u307E\u3059\u304B\uFF1F`, `This replaces the key for ${K.nameOf(cur2, cur2.did)} with the one you loaded. If you haven't saved the current key file, you can't get back to this HAKO. Replace it?`))) return;
    if (cur2 && cur2.did === j.did && cur2.agent && !j.agent) {
      j.agent = cur2.agent;
      if (cur2.agentOk) j.agentOk = cur2.agentOk;
    }
    K.saveRec(j);
    app.did = j.did;
    render();
  } catch (e) {
    say(L(`\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`, `Couldn't read it (${e.message})`));
  }
}
async function unlock() {
  const rec = K.loadRec();
  try {
    const pass = $("p1").value;
    const priv = await K.openKey(rec, pass);
    app.priv = priv;
    app.signer = watched(makeSigner(app.did, priv));
    K.offerSave(app.did, pass);
    if ($("tab").checked) await K.rememberTab(priv, app.did);
    await boot();
  } catch {
    say(L("\u30D1\u30B9\u30D5\u30EC\u30FC\u30BA\u304C\u9055\u3044\u307E\u3059", "Wrong passphrase"));
  }
}
async function reborn() {
  try {
    await app.signer.post(app.box.board, tamaLine({ t: "reborn", n: rand() }));
  } catch (e) {
    return say(L(`\u63B2\u793A\u677F\u306B\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${e.message}\uFF09`, `Couldn't post to the board (${e.message})`));
  }
  const fee = Math.min(Number(cur().reborn_price ?? 0), Math.max(0, app.balance ?? 0));
  addLocal(app.did, { t: "reborn", ms: Date.now() }, -fee);
  app.rebornUntil = Date.now() + 2500;
  setTimeout(render, 2600);
  render();
}
async function startDeal(kind, ctx = null) {
  const x = app.deals[kind];
  const why = actionBlock(kind, app.st, merged(app.stats, app.did));
  if (why) return say(why);
  say("");
  if (kind === "out" && !ctx && visitsOn()) {
    app.outCards = await outCards(app.box, localDay(Date.now(), app.box), app.did, app.stats?.slots?.in ?? [], sha256Hex);
    return render();
  }
  const r = await x.start({ st: app.st, stats: app.stats, ctx: ctx === "town" ? null : ctx });
  if (!r.ok) say(r.why);
  render();
}
function onDeal(kind, ev) {
  if (ev.type === "settled") {
    if (document.body.dataset.tab !== "me") for (const a of document.querySelectorAll('[data-tab-to="me"]')) a.classList.add("ping");
    let dest = null;
    if (kind === "out") {
      try {
        dest = JSON.parse(app.deals.out.st.offer.job.context).dest ?? null;
      } catch {
        dest = null;
      }
    }
    const before = kind === "out" ? stampState() : null;
    addLocal(app.did, { t: kind, ms: ev.ms, contract: ev.contract, ...kind === "play" && playBet(boxAt(app.box, app.deals.play?.st?.at ?? ev.ms)) ? { payout: ev.delta + Number(cur().play_stake) } : {}, ...dest ? { dest: { kind: dest.kind, to: dest.to } } : {} }, ev.delta);
    if (kind === "play") app.happyUntil = Date.now() + 8e3;
    if (kind === "out" && ev.lines) {
      let facts = null;
      try {
        facts = JSON.parse(app.deals.out.st.offer.job.context).facts;
      } catch {
        facts = null;
      }
      app.lastArticle = { contract: ev.contract, lines: facts ? fillArticle(ev.lines, facts) : ev.lines, ...dest ? { dest } : {} };
    }
    app.whyBad = false;
    app.whyAt = null;
    if (before) {
      const after = stampState(), line = stampLine(before, after);
      saveSeen(after);
      if (line) ev = { ...ev, say: ev.say ? `${ev.say}${L("\u3002", ". ")}${line}` : line };
    }
    if (kind === "meal" && ev.say) {
      app.lastSay = ev.say;
      app.lastSayMenu = app.box.meal_menu_from != null && Date.now() >= Number(app.box.meal_menu_from);
      app.sayFresh = true;
      app.why = "";
    } else if (ev.say) app.why = ev.say;
    logOp(`settled \xB7 ${kind} \xB7 ${short(ev.contract)} \xB7 ${ev.delta >= 0 ? "+" : ""}${ev.delta} PAPER`);
  } else if (ev.type === "note") {
    app.why = ev.text;
    app.whyBad = false;
    app.whyAt = null;
  }
  render();
}
const visitsOn = () => typeof app.box.out_visit_instruction === "string" && typeof app.box.out_visit_lead === "string" && Array.isArray(app.box.out_npc_homes);
const destName = (c) => c.kind === "garden" ? L(`HAKO \u2026${String(c.to).slice(-4)} \u306E\u304A\u5EAD`, `HAKO \u2026${String(c.to).slice(-4)}'s garden`) : c.kind === "npc" ? L(`HAKO \u2026${String(c.to).slice(-4)} \u306E\u3042\u305D\u3073\u5834`, `HAKO \u2026${String(c.to).slice(-4)}'s playhouse`) : L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore");
const TOWN_SVG = `<svg width="36" height="27" viewBox="0 0 12 9" shape-rendering="crispEdges" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1"><rect x="0.5" y="3.5" width="3" height="5"/><rect x="4.5" y="0.5" width="3" height="8"/><rect x="8.5" y="2.5" width="3" height="6"/></g><g fill="currentColor"><rect x="5" y="2" width="1" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="2" y="5" width="1" height="1"/><rect x="9" y="4" width="1" height="1"/></g></svg>`;
const pixSvg = (rows) => `<svg width="36" height="27" viewBox="0 0 12 9" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor">${rows.flatMap((r, y) => [...r].map((ch, x) => ch === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "")).join("")}</g></svg>`;
const GARDEN_SVG = pixSvg(["..#.........", ".#.#........", "#.#.#.......", ".#.#........", "..#..#.#.#.#", "#.#..#######", ".##..#.#.#.#", "..#..#######", "############"]);
const PLAY_SVG = pixSvg([".#..##......", ".####.......", ".#..##......", ".####.#.....", ".#..#..#....", ".####...#..#", ".#..#....###", ".#..#.......", "############"]);
function cardsHtml() {
  const one = (c, i) => {
    const art = c.kind === "town" ? TOWN_SVG : c.kind === "garden" ? GARDEN_SVG : PLAY_SVG;
    const kind = c.kind === "garden" ? L("\u304A\u5EAD", "Garden") : c.kind === "npc" ? L("\u3042\u305D\u3073\u5834", "Playhouse") : L("\u30C6\u30AF\u30CE\u30B3\u30A2\u8857", "Technocore");
    const what = c.kind === "town" ? L("\u4ECA\u65E5\u306E\u8857\u306E\u3088\u3046\u3059", "The town today") : c.kind === "garden" ? L("\u3060\u308C\u304B\u306E\u304A\u5EAD", "Someone's garden") : L("\u3042\u305D\u3073\u76F8\u624B\u306E\u5BB6", "Playmate's home");
    const id = c.kind === "town" ? "" : `<span class="id">HAKO \u2026${esc(c.to.slice(-4))}</span>`;
    return `<button type="button" class="dest" style="--c:${DOT.out}" data-dest="${i}" aria-label="${esc(destName(c))}"><span class="art">${art}</span><b>${kind}</b><span class="do">${what}</span>${id}</button>`;
  };
  return `<div class="sit dests"><div class="dest-grid">${app.outCards.map(one).join("")}</div><div class="actions"><button type="button" class="btn sub" id="dest-back">${L("\u623B\u308B", "Back")}</button></div></div>`;
}
function wireCards() {
  const b = $("dest-back");
  if (b) b.onclick = () => {
    app.outCards = null;
    render();
  };
  for (const x of document.querySelectorAll("button[data-dest]")) x.onclick = () => goOut(app.outCards?.[Number(x.dataset.dest)]);
}
async function goOut(c) {
  if (!c) return;
  app.outCards = null;
  if (c.kind === "town") return startDeal("out", "town");
  let dest = { kind: "npc", to: c.to };
  if (c.kind === "garden") {
    let host = null;
    try {
      const r = await fetch(`d/${didFile(c.to)}`, { cache: "no-cache" });
      if (r.ok) host = (await r.json()).did?.[c.to]?.state ?? null;
    } catch {
      host = null;
    }
    if (!host || !Number.isFinite(host.hunger) || !Number.isFinite(host.mood)) {
      render();
      return say(L("\u305D\u306E\u304A\u5EAD\u306F\u3044\u307E\u7559\u5B88\u306E\u3088\u3046\u3067\u3059", "That garden seems to be empty right now"));
    }
    dest = { kind: "garden", to: c.to, words: hostWords(host) };
  }
  await startDeal("out", { v: 1, dest, prompt: visitPrompt(app.box, dest) });
}
async function boot() {
  app.why = "";
  app.viewHtml = null;
  for (const [k] of dealKinds) app.deals[k] = new Deal({ kind: k, app, onEvent: (ev) => onDeal(k, ev) });
  app.sits = loadSits();
  render();
  loadStats().then((s) => {
    app.stats = s;
    render();
    noticeStamps();
    noticeRefill();
    noticeVisitors();
  }).catch(() => {
  });
  const tick = async () => {
    for (const x of Object.values(app.deals)) await x.tick().catch((e) => x.note?.(`error ${e.message}`));
    await tickSits();
    if (!document.hidden) render();
  };
  setInterval(tick, 5e3);
  setInterval(async () => {
    try {
      app.stats = await loadStats();
      noticeStamps();
      noticeRefill();
      noticeVisitors();
    } catch {
    }
  }, 5 * 6e4);
  tick();
}
const didFile = (did) => `${String(did).split(":").pop()}.json`;
async function loadStats() {
  const get = (u) => fetch(u, { cache: "no-cache" });
  const r = await get("garden.json");
  if (!r.ok) {
    const old = await get("latest.json");
    if (!old.ok) throw new Error(`garden.json ${r.status}`);
    return await old.json();
  }
  const g = await r.json(), did = app.did ?? K.loadRec()?.did, out = { box: g.box, feed: g.feed, counts: g.counts, delegates: g.delegates ?? {}, slots: g.slots ?? null, did: {} };
  if (did) {
    try {
      const m = await get(`d/${didFile(did)}`);
      if (m.ok) Object.assign(out.did, (await m.json()).did ?? {});
    } catch {
    }
  }
  return out;
}
const SPLASH_AT = performance.now();
let splashMin = 0;
function endSplash(now = false) {
  const el = $("splash");
  if (!el || el.dataset.out) return;
  el.dataset.out = "1";
  const wait = now ? 0 : Math.max(0, splashMin - (performance.now() - SPLASH_AT));
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  }, wait);
}
function firstSplash() {
  const el = $("splash");
  if (!el) return;
  splashMin = 1500;
  el.classList.add("first");
  el.onclick = () => {
    if (!el.dataset.out) {
      el.dataset.out = "1";
    }
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  };
}
async function start() {
  try {
    if (!K.loadRec()?.did) firstSplash();
  } catch {
  }
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
    app.P = await (await fetch("tama_phrases.json")).json();
  } catch {
    app.P = null;
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
  brief,
  loadLocal,
  merged,
  opLine,
  render,
  saveLocal,
  setMotion,
  start
};
