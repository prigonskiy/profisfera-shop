/**
 * Общий мегаменю «Каталог» — для испечённых страниц и SPA-главной.
 * Данные берёт из tree.json (его пишет build.mjs рядом с counts.json).
 * База сайта вычисляется из адреса самого скрипта, поэтому ссылки и fetch
 * работают одинаково на любой глубине страницы (/, /c/x/, /product/x/).
 */
(function () {
  "use strict";
  var BASE = new URL(".", document.currentScript.src).href;

  var tree = null, mega = null, rootsBox = null, colsBox = null;
  var activeSlug = null, loading = false;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function catUrl(slug) { return BASE + "c/" + encodeURIComponent(slug) + "/"; }
  function btns() { return Array.prototype.slice.call(document.querySelectorAll(".nav-catalog")); }

  function buildShell() {
    mega = document.createElement("div");
    mega.className = "catalog-mega";
    mega.hidden = true;
    mega.innerHTML =
      '<div class="catalog-mega-backdrop"></div>' +
      '<div class="catalog-mega-panel"><div class="wrap cm-grid">' +
      '<nav class="cm-roots"></nav><div class="cm-cols"></div>' +
      '</div></div>';
    document.body.appendChild(mega);
    rootsBox = mega.querySelector(".cm-roots");
    colsBox = mega.querySelector(".cm-cols");
    mega.querySelector(".catalog-mega-backdrop").addEventListener("click", close);
    // наведение/тап по корню — переключает правую панель; сама ссылка ведёт в раздел
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
    rootsBox.innerHTML = tree.map(function (r) {
      return '<a class="cm-root" data-slug="' + esc(r.slug) + '" href="' + catUrl(r.slug) + '"><span>' + esc(r.name) + '</span></a>';
    }).join("");
  }

  function setActive(slug) {
    if (slug === activeSlug) return;
    activeSlug = slug;
    Array.prototype.forEach.call(rootsBox.children, function (a) {
      a.classList.toggle("active", a.getAttribute("data-slug") === slug);
    });
    var root = null;
    for (var i = 0; i < tree.length; i++) if (tree[i].slug === slug) { root = tree[i]; break; }
    var kids = (root && root.children) || [];
    if (!kids.length) {
      colsBox.innerHTML = '<div class="cm-empty">В этом разделе пока нет подкатегорий.</div>';
      return;
    }
    colsBox.innerHTML = kids.map(function (c) {
      var gk = c.children || [];
      var sub = gk.length
        ? '<ul>' + gk.map(function (g) { return '<li><a href="' + catUrl(g.slug) + '">' + esc(g.name) + '</a></li>'; }).join("") + '</ul>'
        : "";
      return '<div class="cm-group"><a class="cm-h" href="' + catUrl(c.slug) + '">' + esc(c.name) + '</a>' + sub + '</div>';
    }).join("");
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
    if (!tree) { load(); return; } // догрузится и откроется
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
    fetch(BASE + "tree.json", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        tree = Array.isArray(data) ? data : [];
        buildShell();
        renderRoots();
        if (tree.length) setActive(tree[0].slug);
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
