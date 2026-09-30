import { dotRows, dotPath, pubFromDid, PALETTE, dotDerive } from "./hako_dot.js";
const MASCOT = { body: "wide", eye: "dot", mouth: "flat", pattern: "band", leg: "short", eye_gap: 2 };
const EGG_COLOR = PALETTE[2];
const ICON = { ...MASCOT, accessory: "ribbon" };
const ICON_COLOR = PALETTE[2];
const FACE = { body: "wide", eye: "round", mouth: "open", pattern: "plain", leg: "long", eye_gap: 2, accessory: "ribbon" };
const ZERO = new Uint8Array(32);
function tamaAccessory(pub) {
  const b = pub[1];
  if (b < 13) return null;
  if (b >= 243) return "crown";
  return ["sprout", "antenna", "ribbon", "horn"][Math.floor((b - 13) * 4 / 230)];
}
const hakoColor = (pub) => dotDerive(pub).color;
const pad = (rows, w) => rows.map((r) => {
  const l = Math.floor((w - r.length) / 2);
  return " ".repeat(l) + r + " ".repeat(w - r.length - l);
});
const EGG_ROWS = [
  "   ##########   ",
  "  #          #  ",
  " #            # ",
  "#              #",
  "#              #",
  "#   ##    ##   #",
  "#              #",
  "#              #",
  "#              #",
  " #            # ",
  "  #          #  ",
  "   ##########   "
];
const BABY_BODY = [
  "   ##########   ",
  "  #          #  ",
  " #            # ",
  "#              #",
  "#   ##    ##   #",
  "#   ##    ##   #",
  "#              #",
  "#              #",
  "#              #",
  " #            # ",
  "  #          #  ",
  "   ##########   ",
  "   ##      ##   "
];
function babyRows(pub) {
  const [rows] = dotRows(pub, { ...MASCOT, accessory: tamaAccessory(pub) });
  const w = rows[0].length;
  return [[...rows.slice(0, 2), ...pad(BABY_BODY, w)], hakoColor(pub)];
}
function hakoRows(pub, over = {}) {
  const [rows, d] = dotRows(pub, { ...MASCOT, accessory: tamaAccessory(pub), ...over });
  return [rows, d.color];
}
const GHOST = { body: "tall", eye: "line", mouth: "none", pattern: "plain", leg: "float", eye_gap: 1 };
function ghostRows(pub) {
  const [rows, d] = dotRows(pub, { ...GHOST, accessory: tamaAccessory(pub) });
  const w = rows[0].length;
  const hem = (on) => Array.from({ length: w }, (_, x) => on(x) ? "#" : " ").join("");
  rows[rows.length - 1] = hem((x) => x === 0 || x === w - 1 || x % 4 === 3 || x % 4 === 0);
  rows.push(hem((x) => x % 4 === 1 || x % 4 === 2));
  return [rows, d.color];
}
function iconRows() {
  return [dotRows(ZERO, ICON)[0], ICON_COLOR];
}
function faceRows(pub) {
  return [dotRows(ZERO, FACE)[0], hakoColor(pub)];
}
const PALE = [PALETTE[2], PALETTE[11]];
const THEMES = {
  light: { wall: "#f7f4ee", floor: "#ece7dc", edge: "#ddd6c8", ink: "#16151c", dim: "#a8a296", in: "#ffffff", pale: "#16151c" },
  dark: { wall: "#1a1a1a", floor: "#242424", edge: "#2e2e2e", ink: "#f0ede6", dim: "#6e6a63", in: "#1a1a1a", pale: "#f0ede6" },
  css: { wall: "var(--r-wall)", floor: "var(--r-floor)", edge: "var(--r-edge)", ink: "var(--r-ink)", dim: "var(--r-dim)", in: "var(--r-in)", pale: "var(--r-pale)" }
};
const lineColor = (color, theme = "css") => PALE.includes(color) ? THEMES[theme].pale : color;
function inside(rows) {
  const h = rows.length, w = rows[0].length;
  const out = Array.from({ length: h }, () => Array(w).fill(false));
  const todo = [];
  const seed = (y, x) => {
    if (y >= 0 && y < h && x >= 0 && x < w && !out[y][x] && rows[y][x] !== "#") {
      out[y][x] = true;
      todo.push([y, x]);
    }
  };
  for (let y = 0; y < h; y++) {
    seed(y, 0);
    seed(y, w - 1);
  }
  for (let x = 0; x < w; x++) {
    seed(0, x);
    seed(h - 1, x);
  }
  while (todo.length) {
    const [y, x] = todo.pop();
    seed(y - 1, x);
    seed(y + 1, x);
    seed(y, x - 1);
    seed(y, x + 1);
  }
  return rows.map((r, y) => [...r].map((c, x) => c !== "#" && !out[y][x] ? "#" : " ").join(""));
}
function stageRows(pub, stage = "hako", over = {}) {
  if (!pub || stage === "egg") return [EGG_ROWS, EGG_COLOR];
  if (stage === "baby") return babyRows(pub);
  if (stage === "ghost") return ghostRows(pub);
  return hakoRows(pub, over);
}
function wrap(rows, px, inner) {
  const w = rows[0].length * px, h = rows.length * px;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${inner}</svg>`;
}
const pubOf = (did) => {
  try {
    return did ? pubFromDid(did) : null;
  } catch {
    return null;
  }
};
const fig = (rows, color, px, theme) => wrap(rows, px, dotPath(0, 0, inside(rows), px, THEMES[theme].in) + dotPath(0, 0, rows, px, lineColor(color, theme)));
function spriteSvg(did, stage = "hako", px = 8, over = {}, theme = "css") {
  const [rows, color] = stageRows(pubOf(did), stage, over);
  return fig(rows, color, px, theme);
}
function faceSvg(did, px = 2, theme = "css") {
  const p = pubOf(did);
  const [rows, color] = p ? faceRows(p) : [dotRows(ZERO, FACE)[0], EGG_COLOR];
  return fig(rows, color, px, theme);
}
function iconSvg(px = 2, theme = "css") {
  const [rows, color] = iconRows();
  return fig(rows, color, px, theme);
}
function spriteRows(did, stage = "hako", over = {}) {
  return stageRows(pubFromDid(did), stage, over);
}
export {
  BABY_BODY,
  EGG_COLOR,
  EGG_ROWS,
  FACE,
  GHOST,
  ICON,
  ICON_COLOR,
  MASCOT,
  PALE,
  THEMES,
  babyRows,
  faceRows,
  faceSvg,
  ghostRows,
  hakoColor,
  hakoRows,
  iconRows,
  iconSvg,
  inside,
  lineColor,
  spriteRows,
  spriteSvg,
  stageRows,
  tamaAccessory
};
