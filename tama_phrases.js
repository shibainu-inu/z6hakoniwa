function unit(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 2 ** 32;
}
function conditions(s) {
  const c = new Set();
  const h = s.hour;
  if (h >= 5 && h < 10) c.add("morning");
  if (h >= 21 || h < 2) c.add("night");
  if (s.hunger != null && s.hunger < 30) c.add("hungry");
  if (s.fedAgoMin != null && s.fedAgoMin <= 10) c.add("fed");
  if (s.mood != null && s.mood >= 70) c.add("happy");
  if (s.mood != null && s.mood < 30) c.add("grumpy");
  if (s.homeAgoMin != null && s.homeAgoMin <= 30) c.add("home");
  if (s.twist) c.add(`twist:${s.twist}`);
  if (s.level >= 4) c.add("lv4");
  if (s.waiting) c.add("waiting");
  return c;
}
function pickPhrase(P, s, seed, { avoid = null, investLeft = Infinity, force = null } = {}) {
  const list = (P?.phrases ?? []).filter((p) => p.id !== avoid && (!p.invest || investLeft > 0));
  const have = conditions(s);
  if (force) have.add(force);
  const specific = list.filter((p) => p.when.some((w) => w !== "any" && have.has(w)));
  const forced = force ? specific.filter((p) => p.when.includes(force)) : [];
  const any = list.filter((p) => p.when.includes("any"));
  const r = unit(`${seed}:pick`);
  const pool = forced.length ? forced : specific.length && (r < Number(P?.specific_share ?? 0.7) || !any.length) ? specific : any;
  if (!pool.length) return null;
  return pool[Math.floor(unit(`${seed}:which`) * pool.length)];
}
function phraseText(p, lang) {
  const en = p.full_en ?? p.en;
  if (lang !== "ja") return { short: p.en, gloss: "", full: en };
  const gloss = p.ja !== p.en ? p.ja : "";
  const ja = p.full_ja ?? (gloss || null);
  return { short: p.en, gloss, full: ja && ja !== en ? `${en}\uFF08${ja}\uFF09` : en };
}
export {
  conditions,
  phraseText,
  pickPhrase,
  unit
};
