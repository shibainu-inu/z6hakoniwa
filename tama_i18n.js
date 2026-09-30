let lang = "ja";
try {
  if (typeof document !== "undefined") {
    const s = localStorage.getItem("tama_lang");
    lang = s === "en" || s === "ja" ? s : String(navigator.language || "ja").toLowerCase().startsWith("ja") ? "ja" : "en";
  }
} catch {
  lang = "ja";
}
const getLang = () => lang;
function setLang(l) {
  lang = l === "en" ? "en" : "ja";
  try {
    localStorage.setItem("tama_lang", lang);
  } catch {
  }
}
const L = (ja, en) => lang === "en" ? en : ja;
export {
  L,
  getLang,
  setLang
};
