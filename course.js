/* Плеер обучения: слайды (листание), видео (iframe), лонгрид (статья).
 * Данные берём из встроенного <script id="courses-data">. Аноним видит лид-форму
 * последним слайдом (UI-заглушка). Без зависимостей, читает window.ProfiAuth. */
(function () {
  "use strict";

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function loggedIn() { return !!(window.ProfiAuth && window.ProfiAuth.token); }
  function coursesData() {
    var el = document.getElementById("courses-data");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  var lb = null, state = null, prevOverflow = "";

  function closeLb() {
    if (!lb) return;
    lb.remove(); lb = null; state = null;
    document.body.style.overflow = prevOverflow;
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (!lb) return;
    if (e.key === "Escape") { closeLb(); return; }
    if (state && state.type === "slides") {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
  }

  function openLb(innerHtml, navHtml) {
    closeLb();
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lb = document.createElement("div");
    lb.className = "edu-lb";
    lb.innerHTML =
      '<div class="edu-lb-inner">' +
        '<button type="button" class="edu-lb-close" aria-label="Закрыть">\u00d7</button>' +
        '<div class="edu-lb-body">' + innerHtml + "</div>" +
        (navHtml || "") +
      "</div>";
    document.body.appendChild(lb);
    lb.querySelector(".edu-lb-close").addEventListener("click", closeLb);
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener("keydown", onKey);
  }

  // --- видео ---
  function openVideo(mod) {
    var url = mod.video_url || "";
    var inner = url
      ? '<div class="edu-video"><iframe src="' + esc(url) + '" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe></div>'
      : '<div class="edu-empty">Видео не указано.</div>';
    openLb(inner, "");
    state = { type: "video" };
  }

  // --- лонгрид ---
  function openLongread(mod) {
    var inner = '<article class="edu-longread">' + (mod.title ? "<h1>" + esc(mod.title) + "</h1>" : "") + (mod.body || "") + "</article>";
    openLb(inner, "");
    state = { type: "longread" };
  }

  // --- слайды ---
  function leadHtml() {
    return '<div class="edu-slide edu-lead">' +
      "<h2>Понравился материал?</h2>" +
      "<p>Оставьте почту — пришлём ещё материалы и сохраним ваш прогресс.</p>" +
      '<input type="email" class="edu-lead-email" placeholder="Email">' +
      '<button type="button" class="edu-lead-btn">Подписаться</button>' +
      '<div class="edu-lead-note">Демо: форма пока не отправляется.</div>' +
      "</div>";
  }
  function slideHtml(s) {
    if (s.__lead) return leadHtml();
    return '<div class="edu-slide">' +
      (s.title ? "<h2>" + esc(s.title) + "</h2>" : "") +
      (s.image ? '<img class="edu-slide-img" src="' + esc(s.image) + '" alt="">' : "") +
      '<div class="edu-slide-body">' + (s.body || "") + "</div>" +
      "</div>";
  }
  function renderSlide() {
    var s = state.slides[state.i];
    lb.querySelector(".edu-slides").innerHTML = slideHtml(s);
    lb.querySelector(".edu-count").textContent = (state.i + 1) + " из " + state.slides.length;
    lb.querySelector(".edu-prev").disabled = state.i === 0;
    lb.querySelector(".edu-next").textContent = state.i === state.slides.length - 1 ? "Готово" : "Далее \u203a";
    var lead = lb.querySelector(".edu-lead-btn");
    if (lead) lead.addEventListener("click", function () {
      lead.textContent = "Спасибо!"; lead.disabled = true;
    });
  }
  function go(d) {
    var ni = state.i + d;
    if (ni < 0 || ni >= state.slides.length) return;
    state.i = ni; renderSlide();
  }
  function openSlides(mod) {
    var slides = (mod.slides || []).slice();
    if (!slides.length) { openLb('<div class="edu-empty">Слайдов пока нет.</div>', ""); return; }
    if (!loggedIn()) slides.push({ __lead: true });
    var nav = '<div class="edu-nav">' +
      '<button type="button" class="edu-prev">\u2039 Назад</button>' +
      '<span class="edu-count"></span>' +
      '<button type="button" class="edu-next">Далее \u203a</button></div>';
    openLb('<div class="edu-slides"></div>', nav);
    state = { type: "slides", slides: slides, i: 0 };
    renderSlide();
    lb.querySelector(".edu-prev").addEventListener("click", function () { go(-1); });
    lb.querySelector(".edu-next").addEventListener("click", function () {
      if (state.i === state.slides.length - 1) closeLb(); else go(1);
    });
  }

  function openModule(mod) {
    if (mod.kind === "video") openVideo(mod);
    else if (mod.kind === "longread") openLongread(mod);
    else openSlides(mod);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-edu-launch]");
    if (!btn) return;
    var data = coursesData();
    if (!data) return;
    var c = data[+btn.getAttribute("data-course")];
    if (!c || !c.modules) return;
    var mod = c.modules[+btn.getAttribute("data-module")];
    if (mod) openModule(mod);
  });
})();
