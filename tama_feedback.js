import { L, getLang } from "./tama_i18n.js";
const MAX = 1e3, GAP_MS = 6e4, LAST = "tama_fb_last";
const KINDS = [["bug", "\u4E0D\u5177\u5408", "Bug"], ["idea", "\u3054\u610F\u898B", "Suggestion"], ["other", "\u305D\u306E\u4ED6", "Other"]];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function openFeedback({ url, did = null, ver = "" }) {
  if (!url) return;
  document.getElementById("fbdlg")?.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "fbdlg";
  dlg.className = "fb";
  dlg.setAttribute("aria-labelledby", "fb-h");
  const tail = did ? did.slice(-8) : "";
  dlg.innerHTML = `<form method="dialog" class="fb-form" novalidate>
    <div class="fb-hd"><h2 id="fb-h">${L("\u3054\u610F\u898B\u30FB\u4E0D\u5177\u5408\u3092\u9001\u308B", "Send feedback")}</h2><button type="button" class="fb-x" aria-label="${L("\u9589\u3058\u308B", "Close")}">\xD7</button></div>
    <p class="fb-lead">${L(
    "\u6C17\u3065\u3044\u305F\u3053\u3068\u3001\u56F0\u3063\u305F\u3053\u3068\u3001\u307B\u3057\u3044\u3082\u306E\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002\u9001\u3063\u305F\u5185\u5BB9\u306F\u4F5C\u8005\u3060\u3051\u304C\u8AAD\u307F\u3001\u307B\u304B\u306E\u4EBA\u306B\u306F\u898B\u3048\u307E\u305B\u3093\u3002\u8FD4\u4E8B\u306F\u3067\u304D\u307E\u305B\u3093\u306E\u3067\u3054\u4E86\u627F\u304F\u3060\u3055\u3044\u3002",
    "Tell us what you noticed, what got in your way, or what you'd like to see. Only the developer reads your message, and no one else can see it. Replies aren't possible."
  )}</p>
    <div class="fb-kind" role="radiogroup" aria-label="${L("\u7A2E\u985E", "Type")}">${KINDS.map(([k, ja, en], i) => `<button type="button" role="radio" data-k="${k}" aria-checked="${i === 0}">${L(ja, en)}</button>`).join("")}</div>
    <textarea id="fb-text" maxlength="${MAX}" rows="6" placeholder="${L("\u3053\u3053\u306B\u66F8\u3044\u3066\u304F\u3060\u3055\u3044", "Write here")}" aria-label="${L("\u672C\u6587", "Message")}"></textarea>
    <div class="fb-cnt mono" aria-hidden="true">0 / ${MAX}</div>
    ${did ? `<label class="fb-did"><input type="checkbox" id="fb-did"> <span>${L(`HAKO \u306E DID\uFF08z6Mk\u2026${esc(tail)}\uFF09\u3092\u6DFB\u3048\u308B\u3002\u4E0D\u5177\u5408\u3092\u8ABF\u3079\u308B\u3068\u304D\u306B\u5F79\u7ACB\u3061\u307E\u3059`, `Include my HAKO's DID (z6Mk\u2026${esc(tail)}). It helps us look into problems.`)}</span></label>` : ""}
    <p class="fb-err" role="alert" hidden></p>
    <button type="submit" class="btn fb-send" disabled>${L("\u9001\u308B", "Send")}</button>
    <p class="fb-priv">${L("\u9375\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093", "Your key isn't sent.")}</p>
  </form>
  <div class="fb-done" hidden><b>${L("\u5C4A\u304D\u307E\u3057\u305F", "Sent")}</b><p>${L("\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002\u3044\u305F\u3060\u3044\u305F\u5185\u5BB9\u306F\u4F5C\u8005\u304C\u8AAD\u307F\u307E\u3059\u3002", "Thank you. The developer will read it.")}</p>
    <button type="button" class="btn fb-close">${L("\u9589\u3058\u308B", "Close")}</button></div>`;
  document.body.append(dlg);
  const q = (s) => dlg.querySelector(s);
  const form = q(".fb-form"), text = q("#fb-text"), cnt = q(".fb-cnt"), send = q(".fb-send"), err = q(".fb-err");
  let kind = "bug", busy = false;
  const upd = () => {
    cnt.textContent = `${text.value.length} / ${MAX}`;
    send.disabled = busy || !text.value.trim();
  };
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
  };
  text.oninput = upd;
  q(".fb-kind").onclick = (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    kind = b.dataset.k;
    for (const x of q(".fb-kind").children) x.setAttribute("aria-checked", x === b);
  };
  q(".fb-x").onclick = close;
  q(".fb-close").onclick = close;
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener("close", () => dlg.remove());
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body || busy) return;
    err.hidden = true;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST) ?? 0);
    } catch {
    }
    if (Date.now() - last < GAP_MS) return fail(L("\u7D9A\u3051\u3066\u9001\u308B\u3068\u304D\u306F 1 \u5206\u307B\u3069\u5F85\u3063\u3066\u304F\u3060\u3055\u3044\u3002", "Please wait about a minute before sending again."));
    const f = { kind: { stringValue: kind }, text: { stringValue: body.slice(0, MAX) }, ver: { stringValue: String(ver).slice(0, 40) }, lang: { stringValue: getLang() } };
    if (did && q("#fb-did")?.checked) f.did = { stringValue: did };
    busy = true;
    upd();
    send.textContent = L("\u9001\u3063\u3066\u3044\u307E\u3059\u2026", "Sending\u2026");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: f }) });
      if (!r.ok) throw new Error(String(r.status));
      try {
        localStorage.setItem(LAST, String(Date.now()));
      } catch {
      }
      form.hidden = true;
      q(".fb-done").hidden = false;
      q(".fb-close").focus();
    } catch {
      fail(L("\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u6642\u9593\u3092\u304A\u3044\u3066\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "Couldn't send. Please try again later."));
    } finally {
      busy = false;
      send.textContent = L("\u9001\u308B", "Send");
      upd();
    }
  };
  dlg.showModal();
  text.focus();
}
export {
  openFeedback
};
