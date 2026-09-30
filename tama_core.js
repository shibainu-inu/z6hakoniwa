const HOUR = 36e5;
function localDay(ms, box) {
  return new Date(ms + Number(box.day_utc_offset_min ?? 540) * 6e4).toISOString().slice(0, 10);
}
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function lifeState(events, now, box) {
  const ev = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.ms - b.ms || a.i - b.i);
  const hr = Number(box.hunger_per_hour), mr = Number(box.mood_per_hour);
  const hMax = Number(box.hunger_max), mMax = Number(box.mood_max);
  const graveMs = Number(box.grave_after_hours) * HOUR;
  let s = null;
  let rebirths = 0;
  const fresh = (ms, reborn = false) => ({
    bornAt: ms,
    hunger: Number(reborn ? box.reborn_hunger ?? box.hunger_start : box.hunger_start),
    mood: Number(box.mood_start),
    at: ms,
    zeroSince: null,
    grave: false,
    graveAt: null,
    days: new Set(),
    cares: 0
  });
  const advance = (t) => {
    if (!s || s.grave || t <= s.at) return;
    const dtH = (t - s.at) / HOUR;
    if (s.zeroSince === null) {
      const h = s.hunger - hr * dtH;
      if (h <= 0) {
        s.zeroSince = hr > 0 ? s.at + s.hunger / hr * HOUR : t;
        s.hunger = 0;
      } else s.hunger = h;
    }
    s.mood = Math.max(0, s.mood - mr * dtH);
    if (s.zeroSince !== null && t - s.zeroSince >= graveMs) {
      s.grave = true;
      s.graveAt = s.zeroSince + graveMs;
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
    if (e.t === "meal") s.hunger = clamp(s.hunger + Number(box.meal_fill), 0, hMax);
    else if (e.t === "out") s.hunger = clamp(s.hunger - Number(box.out_hunger), 0, hMax);
    else if (e.t === "play") {
      s.hunger = clamp(s.hunger - Number(box.play_hunger), 0, hMax);
      s.mood = clamp(s.mood + Number(box.play_mood), 0, mMax);
    } else continue;
    s.zeroSince = s.hunger > 0 ? null : s.zeroSince ?? e.ms;
    s.days.add(localDay(e.ms, box));
    s.lastCare = e.ms;
    s.cares += 1;
  }
  if (!s) return { born: false };
  advance(now);
  const today = localDay(now, box);
  const days = [...s.days].sort();
  let streak = 0;
  if (!s.grave && days.length) {
    let want = days.includes(today) ? dayNum(today) : dayNum(today) - 1;
    const set = new Set(days.map(dayNum));
    while (set.has(want)) {
      streak += 1;
      want -= 1;
    }
  }
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
    stage: growthStage(s.cares, days.length, now - s.bornAt, box)
  };
}
const round2 = (x) => Math.round(x * 100) / 100;
function growthStage(cares, careDays, ageMs, box) {
  const h = ageMs / HOUR;
  if (cares < Number(box.hatch_cares ?? 0) || h < Number(box.hatch_hours ?? 0)) return "egg";
  if (h < Number(box.grow_hours ?? 0) || careDays < Number(box.grow_care_days ?? 0)) return "baby";
  return "hako";
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
  const m = new RegExp(`^${box.box}-(meal|out|play)-[0-9a-z]{8}-[0-9]+$`).exec(String(id ?? ""));
  return m ? m[1] : null;
}
const acceptKey = (payer, kind) => `${String(payer).slice(-8).toLowerCase()}-${kind}`;
export {
  HOUR,
  TAMA,
  acceptKey,
  checkLines,
  collapseSpace,
  fillArticle,
  growthStage,
  jobId,
  jobKind,
  lifeState,
  localDay,
  mealPrompt,
  outPrompt,
  parseTama,
  playPayout,
  rewardOf,
  round2,
  splitLines,
  tamaLine,
  toAscii
};
