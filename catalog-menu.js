/**
 * Общее мегаменю «Каталог» — две ступени внешнего каталога.
 * Данные берёт из catalog.json (его пишет build.mjs): разделы «для кого» →
 * направления с их листовыми группами. У каждой группы готовый target-url
 * (толстый срез → своя страница, тонкий → каноническая /c/).
 * База сайта вычисляется из адреса самого скрипта, поэтому ссылки и fetch
 * работают одинаково на любой глубине страницы.
 */
(function () {
  "use strict";
  var BASE = new URL(".", document.currentScript.src).href;

  var sections = null, mega = null, rootsBox = null, colsBox = null;
  var activeSlug = null, loading = false;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  // url'ы в catalog.json root-relative («/dlya-vracha/...»); BASE уже включает поддиректорию сайта
  function abs(u) { return BASE + String(u == null ? "" : u).replace(/^\//, ""); }
  function btns() { return Array.prototype.slice.call(document.querySelectorAll(".nav-catalog")); }

  function buildShell() {
    mega = document.createElement("div");
    mega.className = "catalog-mega";
    mega.hidden = true;
    mega.innerHTML =
      '<div class="catalog-mega-backdrop"></div>' +
      '<div class="catalog-mega-panel"><button type="button" class="cm-close" aria-label="Закрыть каталог">✕</button><div class="wrap cm-grid">' +
      '<nav class="cm-roots"></nav><div class="cm-cols"></div>' +
      '</div></div>';
    document.body.appendChild(mega);
    rootsBox = mega.querySelector(".cm-roots");
    colsBox = mega.querySelector(".cm-cols");
    mega.querySelector(".catalog-mega-backdrop").addEventListener("click", close);
    mega.querySelector(".cm-close").addEventListener("click", close);
    // наведение/тап по разделу «для кого» — переключает правую панель; ссылка ведёт на лендинг раздела
    rootsBox.addEventListener("mouseover", function (e) {
      var a = e.target.closest ? e.target.closest(".cm-root") : null;
      if (a) setActive(a.getAttribute("data-slug"));
    });
    rootsBox.addEventListener("focusin", function (e) {
      var a = e.target.closest ? e.target.closest(".cm-root") : null;
      if (a) setActive(a.getAttribute("data-slug"));
    });
  }

  function renderRoots() {
    rootsBox.innerHTML = sections.map(function (s) {
      return '<a class="cm-root" data-slug="' + esc(s.slug) + '" href="' + abs(s.url) + '"><span>' + esc(s.title) + '</span></a>';
    }).join("");
  }

  function findSection(slug) {
    for (var i = 0; i < sections.length; i++) if (sections[i].slug === slug) return sections[i];
    return null;
  }

  function setActive(slug) {
    if (slug === activeSlug) return;
    activeSlug = slug;
    Array.prototype.forEach.call(rootsBox.children, function (a) {
      a.classList.toggle("active", a.getAttribute("data-slug") === slug);
    });
    var sec = findSection(slug);
    if (!sec) { colsBox.innerHTML = ""; return; }

    var html;
    if (sec.directions && sec.directions.length) {
      // ступень 2: направления, у каждого — его листовые группы
      html = sec.directions.map(function (d) {
        var sub = (d.groups && d.groups.length)
          ? '<ul>' + d.groups.map(function (g) {
              return '<li><a href="' + abs(g.url) + '">' + esc(g.name) + '</a></li>';
            }).join("") + '</ul>'
          : "";
        return '<div class="cm-group"><a class="cm-h" href="' + abs(d.url) + '">' + esc(d.title) + '</a>' + sub + '</div>';
      }).join("");
    } else if (sec.groups && sec.groups.length) {
      // раздел без направлений (общая медицина / пациент) — сразу листовые категории
      html = sec.groups.map(function (g) {
        return '<div class="cm-group"><a class="cm-h" href="' + abs(g.url) + '">' + esc(g.name) + '</a></div>';
      }).join("");
    } else {
      html = '<div class="cm-empty">В этом разделе пока нет товаров.</div>';
    }
    colsBox.innerHTML = html;
  }

  function position() {
    var st = document.querySelector(".site-top");
    var top = st ? Math.max(0, Math.round(st.getBoundingClientRect().bottom)) : 110;
    mega.style.setProperty("--cm-top", top + "px");
  }

  function setBtn(on) {
    btns().forEach(function (b) {
      b.classList.toggle("open", on);
      b.setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  function open() {
    if (!sections) { load(); return; } // догрузится и откроется
    position();
    mega.hidden = false;
    document.body.classList.add("cm-open");
    setBtn(true);
  }
  function close() {
    if (mega) mega.hidden = true;
    document.body.classList.remove("cm-open");
    setBtn(false);
  }
  function toggle() { if (mega && !mega.hidden) close(); else open(); }

  function load() {
    if (loading) return;
    loading = true;
    fetch(BASE + "catalog.json", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        sections = Array.isArray(data) ? data : [];
        buildShell();
        renderRoots();
        if (sections.length) setActive(sections[0].slug);
        loading = false;
        open();
      })
      .catch(function () { loading = false; });
  }

  function init() {
    btns().forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", function (e) { e.preventDefault(); toggle(); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (mega && !mega.hidden) position(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
