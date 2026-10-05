const HOUR = 36e5;
function localDay(ms, box) {
  return new Date(ms + Number(box.day_utc_offset_min ?? 540) * 6e4).toISOString().slice(0, 10);
}
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function mergeCovers(list) {
  const out = [];
  for (const [a, b] of list.filter(([a2, b2]) => b2 > a2).sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
function graveTime(start, need, covers) {
  let t = start, left = need;
  for (const [a, b] of covers) {
    if (b <= t) continue;
    if (a > t) {
      if (a - t >= left) return t + left;
      left -= a - t;
    }
    t = Math.max(t, b);
  }
  return t + left;
}
function boxAt(box, ms) {
  const ch = box.changes ?? [];
  if (!ch.length) return box;
  const out = { ...box };
  for (const c of [...ch].sort((a, b) => Number(a.from) - Number(b.from))) if (Number(c.from) <= ms) Object.assign(out, c.set);
  return out;
}
function lifeState(events, now, box) {
  const ev = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.ms - b.ms || a.i - b.i);
  const covers = mergeCovers(ev.filter((e) => e.t === "sit").map((e) => [Number(e.ms), Number(e.until)]));
  let s = null;
  let rebirths = 0;
  const fresh = (ms, reborn = false) => {
    const b = boxAt(box, ms);
    return {
      bornAt: ms,
      hunger: Number(reborn ? b.reborn_hunger ?? b.hunger_start : b.hunger_start),
      mood: Number(b.mood_start),
      at: ms,
      zeroSince: null,
      grave: false,
      graveAt: null,
      days: new Set(),
      cares: 0
    };
  };
  const advance = (t) => {
    if (!s || s.grave || t <= s.at) return;
    const dtH = (t - s.at) / HOUR;
    const b = boxAt(box, s.at), hr = Number(b.hunger_per_hour), mr = Number(b.mood_per_hour);
    if (s.zeroSince === null) {
      const h = s.hunger - hr * dtH;
      if (h <= 0) {
        s.zeroSince = hr > 0 ? s.at + s.hunger / hr * HOUR : t;
        s.hunger = 0;
      } else s.hunger = h;
    }
    s.mood = Math.max(0, s.mood - mr * dtH);
    if (s.zeroSince !== null) {
      const g = graveTime(s.zeroSince, Number(boxAt(box, s.zeroSince).grave_after_hours) * HOUR, covers);
      if (t >= g) {
        s.grave = true;
        s.graveAt = g;
      }
    }
    s.at = t;
  };
  for (const e of ev) {
    if (e.t === "join") {
      if (!s) s = fresh(e.ms);
      continue;
    }
    if (!s) continue;
    advance(e.ms);
    if (e.t === "reborn") {
      if (s.grave) {
        rebirths += 1;
        s = fresh(e.ms, true);
      }
      continue;
    }
    if (s.grave) continue;
    const b = boxAt(box, e.ms), hMax = Number(b.hunger_max), mMax = Number(b.mood_max);
    if (e.t === "meal") s.hunger = clamp(s.hunger + Number(b.meal_fill), 0, hMax);
    else if (e.t === "out") s.hunger = clamp(s.hunger - Number(b.out_hunger), 0, hMax);
    else if (e.t === "play") {
      s.hunger = clamp(s.hunger - Number(b.play_hunger), 0, hMax);
      s.mood = clamp(s.mood + Number(b.play_mood), 0, mMax);
    } else continue;
    s.zeroSince = s.hunger > 0 ? null : s.zeroSince ?? e.ms;
    if (e.t === "out") continue;
    s.days.add(localDay(e.ms, box));
    s.lastCare = e.ms;
    s.cares += 1;
  }
  if (!s) return { born: false };
  advance(now);
  const today = localDay(now, box);
  const days = [...s.days].sort();
  let streak = 0;
  const frozen = new Set();
  for (const [a, b] of covers) {
    for (let d = dayNum(localDay(Math.max(a, s.bornAt), box)), e = dayNum(localDay(Math.min(b, now), box)); d <= e; d++) frozen.add(d);
  }
  if (!s.grave && days.length) {
    const set = new Set(days.map(dayNum));
    const lo = Math.min(...set, ...frozen);
    for (let want = dayNum(today), first = true; want >= lo; want--, first = false) {
      if (set.has(want)) streak += 1;
      else if (!first && !frozen.has(want)) break;
    }
  }
  const cover = covers.find(([a, b]) => a <= now && now < b);
  const outsToday = ev.filter((e) => e.t === "out" && e.ms >= s.bornAt && localDay(e.ms, box) === today).length;
  return {
    born: true,
    alive: !s.grave,
    grave: s.grave,
    graveAt: s.graveAt,
    bornAt: s.bornAt,
    hunger: round2(s.hunger),
    mood: round2(s.mood),
    streak,
    rebirths,
    outsToday,
    careDays: days.length,
    lastCare: s.lastCare ?? null,
    cares: s.cares,
    stage: growthStage(s.cares, days.length, now - s.bornAt, box),
    accLevel: accLevel(days.length, growthStage(s.cares, days.length, now - s.bornAt, box), box),
    sitUntil: cover ? cover[1] : null
  };
}
const round2 = (x) => Math.round(x * 100) / 100;
function accLevel(careDays, stage, box) {
  if (stage !== "hako") return 1;
  let lv = 1;
  for (const c of box.acc_grow_days ?? []) if (careDays >= Number(c)) lv += 1;
  return Math.min(lv, 4);
}
function growthStage(cares, careDays, ageMs, box) {
  const h = ageMs / HOUR;
  if (cares < Number(box.hatch_cares ?? 0) || h < Number(box.hatch_hours ?? 0)) return "egg";
  if (h < Number(box.grow_hours ?? 0) || careDays < Number(box.grow_care_days ?? 0)) return "baby";
  return "hako";
}
const playTableAt = (box, lockMs) => box.play_table_from != null && lockMs < Number(box.play_table_from) && box.play_table_before ? box.play_table_before : box.play_table;
async function playRoll(secret, contract) {
  const hx = (s) => String(s ?? "").replace(/^0x/, "");
  const a = hx(secret), c = hx(contract);
  if (!/^([0-9a-f]{2})+$/i.test(a) || !/^([0-9a-f]{2})+$/i.test(c)) return null;
  const bytes = Uint8Array.from((a + c).match(/../g), (h) => parseInt(h, 16));
  return "0x" + [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function playPayoutAt(box, lockMs, contract, secret) {
  const table = playTableAt(box, lockMs);
  if (box.play_secret_from != null && lockMs >= Number(box.play_secret_from)) {
    const roll = await playRoll(secret, contract);
    return roll ? playPayout(roll, table) : null;
  }
  return playPayout(contract, table);
}
function playPayout(contract, table) {
  const hex = String(contract).replace(/^0x/, "");
  if (!/^[0-9a-f]{8}/i.test(hex)) return null;
  const r = Number.parseInt(hex.slice(0, 8), 16) % 100;
  let acc = 0;
  for (const [w, amount] of table) {
    acc += Number(w);
    if (r < acc) return Number(amount);
  }
  return Number(table[table.length - 1][1]);
}
const STRIP = /^[ \t\r]+|[ \t\r]+$/g;
const DID_RE = /did:key|z6mk[1-9a-z]{8,}/i;
const URL_RE = /(:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ly|me|app|dev|jp|co|gg|link|site|top|info|biz|ru|cn|tk|click|online|shop)\b)/i;
const WORD_RE = /[a-z0-9{}']+/g;
const cpLen = (s) => Array.from(String(s)).length;
const words = (s) => String(s).toLowerCase().match(WORD_RE) ?? [];
const collapseSpace = (s) => String(s).split(/\s+/).filter((x) => x).join(" ");
function splitLines(output) {
  const lines = String(output).replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(STRIP, ""));
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function checkLines(lines, { n, maxChars = 140, instruction = "", fragmentWords = 5, needs = [], digitsOk = true }) {
  if (!Array.isArray(lines)) return { ok: false, why: "not lines" };
  if (lines.length !== n) return { ok: false, why: `${lines.length} lines, want ${n}` };
  const seen = new Set();
  const iw = words(instruction);
  for (let k = 0; k < lines.length; k++) {
    const l = String(lines[k]);
    if (l === "") return { ok: false, why: `${k + 1}:empty` };
    if (cpLen(l) > maxChars) return { ok: false, why: `${k + 1}:over ${maxChars}` };
    if (DID_RE.test(l)) return { ok: false, why: `${k + 1}:did` };
    if (URL_RE.test(l)) return { ok: false, why: `${k + 1}:url` };
    if (seen.has(l)) return { ok: false, why: `${k + 1}:duplicate` };
    seen.add(l);
    const lw = words(l);
    for (let i = 0; i + fragmentWords <= lw.length; i++) {
      const g = lw.slice(i, i + fragmentWords).join(" ");
      for (let j = 0; j + fragmentWords <= iw.length; j++) if (iw.slice(j, j + fragmentWords).join(" ") === g) return { ok: false, why: `${k + 1}:instruction fragment` };
    }
    if (!digitsOk && /[0-9]/.test(l.replace(/\{[A-Z]\}/g, ""))) return { ok: false, why: `${k + 1}:digits` };
  }
  for (const [i, s] of needs) if (!String(lines[i] ?? "").includes(s)) return { ok: false, why: `${i + 1}:missing ${s}` };
  return { ok: true, why: "" };
}
function rewardOf(box, nth) {
  const r = box.out_rewards;
  if (!Array.isArray(r)) return Number(box.out_reward ?? 0);
  return nth >= 1 && nth <= r.length ? Number(r[nth - 1]) : 0;
}
const fillArticle = (lines, facts) => lines.map((l) => l.split("{V}").join(String(facts.value)).split("{B}").join(String(facts.base)));
function mealPrompt(instruction, st) {
  const h = st.hunger < 25 ? "starving" : st.hunger < 60 ? "hungry" : "a bit peckish";
  const m = st.mood < 25 ? "gloomy" : st.mood < 60 ? "calm" : "cheerful";
  return collapseSpace(`${instruction} Mood words: ${h}, ${m}.`);
}
function outPrompt(instruction, facts) {
  return collapseSpace(`${instruction} Today's unusual thing: ${facts.label} was ${facts.dir} than usual.`);
}
const TAMA = "tama/0 ";
const toAscii = (s) => s.replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const tamaLine = (obj) => TAMA + toAscii(JSON.stringify(obj));
function parseTama(text) {
  const t = String(text ?? "");
  if (!t.startsWith(TAMA)) return null;
  try {
    const v = JSON.parse(t.slice(TAMA.length));
    return v && typeof v === "object" && !Array.isArray(v) && typeof v.t === "string" ? v : null;
  } catch {
    return null;
  }
}
const jobId = (box, kind, did, ms) => `${box.box}-${kind}-${String(did).slice(-8).toLowerCase()}-${ms}`;
function jobKind(box, id) {
  const m = new RegExp(`^${box.box}-(meal|out|play|sit|sitplay)-[0-9a-z]{8}-[0-9]+$`).exec(String(id ?? ""));
  return m ? m[1] : null;
}
const isSit = (kind) => kind === "sit" || kind === "sitplay";
const acceptKey = (payer, kind, offerId = "") => `${String(payer).slice(-8).toLowerCase()}-${kind}` + (isSit(kind) ? `-${String(offerId).slice(2, 10)}` : "");
function sitSchedule(box, t0, n, plays = 0, first = Number(box.sit_first_hours ?? box.sit_every_hours)) {
  const one = (kind, k, j, at) => {
    const claimByMs = at + Math.round(Number(box.sit_window_hours) * HOUR);
    return { kind, k, j, at, claimByMs, refundAfterMs: claimByMs + HOUR };
  };
  const out = [];
  for (let k = 1; k <= n; k++) {
    const meal = t0 + Math.round((first + (k - 1) * Number(box.sit_every_hours)) * HOUR);
    out.push(one("sit", k, 0, meal));
    for (let j = 1; j <= plays; j++) out.push(one("sitplay", k, j, meal + Math.round(j * Number(box.sit_play_gap_hours) * HOUR)));
  }
  return out;
}
function sitWhy(box, offer, lockMs) {
  let at;
  try {
    at = JSON.parse(offer.job.context).at;
  } catch {
    return "no at";
  }
  if (typeof at !== "number" || !Number.isInteger(at)) return "no at";
  if (offer.claimByMs !== at + Math.round(Number(box.sit_window_hours) * HOUR) || offer.refundAfterMs !== offer.claimByMs + HOUR) return "deadlines";
  if (at <= lockMs) return "at not ahead";
  if (at - lockMs > Number(box.sit_max_days) * Number(box.sit_every_hours) * HOUR + HOUR) return "too far";
  return null;
}
const HUNGER_WORDS = ["starving", "hungry", "a bit peckish"], MOOD_WORDS = ["gloomy", "calm", "cheerful"];
const MOOD_LABELS = {
  flow: "how busy the market was",
  alike: "the share of messages that looked alike",
  nocontract: "the share of accepts without a contract field",
  refund: "the share of deals that ended in a refund",
  newcomer: "the share of faces never seen before"
};
const FACT_VALUE = /^[0-9]{1,6}(%| lines a minute)$/;
function promptOk(box, kind, context) {
  if (kind === "play") return true;
  let c = null;
  try {
    c = JSON.parse(String(context));
  } catch {
    return false;
  }
  if (!c || typeof c !== "object" || typeof c.prompt !== "string") return false;
  if (kind === "out") {
    const f = c.facts;
    if (!f || typeof f !== "object" || MOOD_LABELS[f.metric] !== f.label || !["higher", "lower"].includes(f.dir) || !FACT_VALUE.test(String(f.value)) || !FACT_VALUE.test(String(f.base))) return false;
    return c.prompt === outPrompt(box.out_instruction, f);
  }
  const ins = kind === "sitplay" ? box.sit_play_instruction : box.meal_instruction;
  return HUNGER_WORDS.some((h) => MOOD_WORDS.some((m) => c.prompt === collapseSpace(`${ins} Mood words: ${h}, ${m}.`)));
}
export {
  HOUR,
  HUNGER_WORDS,
  MOOD_LABELS,
  MOOD_WORDS,
  TAMA,
  accLevel,
  acceptKey,
  boxAt,
  checkLines,
  collapseSpace,
  fillArticle,
  graveTime,
  growthStage,
  isSit,
  jobId,
  jobKind,
  lifeState,
  localDay,
  mealPrompt,
  mergeCovers,
  outPrompt,
  parseTama,
  playPayout,
  playPayoutAt,
  playRoll,
  playTableAt,
  promptOk,
  rewardOf,
  round2,
  sitSchedule,
  sitWhy,
  splitLines,
  tamaLine,
  toAscii
};
