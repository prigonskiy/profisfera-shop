/* Мобильное поведение левого сайдбара категории: кнопки «Категории»/«Фильтры»
 * открывают сайдбар как выезжающую панель. На десктопе сайдбар виден всегда —
 * скрипт там ничего не делает (кнопки и оверлей спрятаны через CSS). */
(function () {
  "use strict";
  var sidebar = document.getElementById("cat-sidebar");
  if (!sidebar) return;

  var overlay = document.createElement("div");
  overlay.className = "cat-overlay";
  document.body.appendChild(overlay);

  function open(target) {
    sidebar.classList.add("open");
    overlay.classList.add("show");
    document.body.classList.add("cat-drawer-open");
    if (target === "filters") {
      var f = document.getElementById("filters");
      if (f) f.scrollIntoView({ block: "start" });
    } else {
      sidebar.scrollTop = 0;
    }
  }
  function close() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    document.body.classList.remove("cat-drawer-open");
  }

  document.querySelectorAll(".cat-mtoggle").forEach(function (btn) {
    btn.addEventListener("click", function () { open(btn.getAttribute("data-target")); });
  });
  var closeBtn = sidebar.querySelector(".cat-sidebar-close");
  if (closeBtn) closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  // тап по категории в панели — закрываем (переход всё равно произойдёт)
  sidebar.querySelectorAll(".cat-nav a").forEach(function (a) {
    a.addEventListener("click", close);
  });
})();
