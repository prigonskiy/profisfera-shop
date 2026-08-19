/**
 * Лайтбокс страницы кейса. Открывает превью-изображения из галереи ([data-lb])
 * и картинки внутри тела статьи (.case-article figure img) в общий оверлей
 * со стрелками, подписью, закрытием по Esc/клику вне картинки. Без зависимостей.
 */
(function () {
  "use strict";
  var items = [], idx = 0, ov = null;

  function collect() {
    var out = [];
    document.querySelectorAll(".case-gallery [data-lb]").forEach(function (el) {
      out.push({ src: el.getAttribute("data-lb"), cap: el.getAttribute("data-cap") || "", el: el });
    });
    document.querySelectorAll(".case-article figure img").forEach(function (img) {
      var fig = img.closest("figure"), fc = fig ? fig.querySelector("figcaption") : null;
      out.push({ src: img.getAttribute("src"), cap: fc ? fc.textContent : "", el: img });
      img.style.cursor = "zoom-in";
    });
    return out.filter(function (x) { return x.src; });
  }

  function build() {
    ov = document.createElement("div");
    ov.className = "lb-overlay"; ov.hidden = true;
    ov.innerHTML =
      '<button type="button" class="lb-close" aria-label="Закрыть">\u2715</button>' +
      '<button type="button" class="lb-nav lb-prev" aria-label="Предыдущее">\u2039</button>' +
      '<figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"></figcaption></figure>' +
      '<button type="button" class="lb-nav lb-next" aria-label="Следующее">\u203A</button>';
    document.body.appendChild(ov);
    ov.querySelector(".lb-close").onclick = close;
    ov.querySelector(".lb-prev").onclick = function (e) { e.stopPropagation(); go(-1); };
    ov.querySelector(".lb-next").onclick = function (e) { e.stopPropagation(); go(1); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", function (e) {
      if (ov.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    });
  }

  function show() {
    var it = items[idx]; if (!it) return;
    ov.querySelector(".lb-img").src = it.src;
    var cap = ov.querySelector(".lb-cap");
    cap.textContent = it.cap || ""; cap.style.display = it.cap ? "" : "none";
    var multi = items.length > 1;
    ov.querySelector(".lb-prev").style.display = multi ? "" : "none";
    ov.querySelector(".lb-next").style.display = multi ? "" : "none";
  }
  function open(i) { idx = i; ov.hidden = false; document.body.classList.add("lb-open"); show(); }
  function close() { ov.hidden = true; document.body.classList.remove("lb-open"); }
  function go(d) { idx = (idx + d + items.length) % items.length; show(); }

  function init() {
    items = collect(); if (!items.length) return;
    build();
    items.forEach(function (it, i) {
      it.el.addEventListener("click", function (e) { if (it.el.tagName === "BUTTON") e.preventDefault(); open(i); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
