/**
 * Мегаменю «Каталог» — три ступени внешнего каталога (инкремент F).
 * Данные: menu.json { settings, sections }. Ступени: аудитории → направления →
 * узлы третьего уровня (type: "group" — презентационная группа с children;
 * "category" — негруппированная листовая; в перспективе "systems").
 * Desktop: три колонки-каскад, переключение направлений с hover-intent.
 * Mobile: drill-down (колонки как экраны с «назад»).
 * render_mode: "cascade" (по умолчанию) или "wall" (плоская стена — фолбэк).
 */
(function () {
  "use strict";
  var BASE = new URL(".", document.currentScript.src).href;

  var data = null, settings = { render_mode: "cascade", hover_intent_ms: 180, mobile: "drill-down" };
  var mega = null, colAud = null, colDir = null, colPanel = null, backbar = null;
  var activeAud = null, activeDir = null, level = 0, hoverTimer = null, loading = false;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function abs(u) { return BASE + String(u == null ? "" : u).replace(/^\//, ""); }
  function btns() { return Array.prototype.slice.call(document.querySelectorAll(".nav-catalog")); }
  function isMobile() { return window.matchMedia("(max-width: 760px)").matches; }
  function findSec(slug) { for (var i = 0; i < data.sections.length; i++) if (data.sections[i].slug === slug) return data.sections[i]; return null; }
  function findDir(sec, slug) { if (!sec) return null; for (var i = 0; i < sec.directions.length; i++) if (sec.directions[i].slug === slug) return sec.directions[i]; return null; }

  // ---------- рендеры (данные+состояние → HTML) ----------
  function renderAud(sections, activeSlug) {
    return sections.map(function (s) {
      var on = s.slug === activeSlug ? " active" : "";
      return '<a class="cm-aud' + on + '" data-aud="' + esc(s.slug) + '" href="' + abs(s.url) + '"><span>' + esc(s.title) + '</span><i class="cm-caret"></i></a>';
    }).join("");
  }
  function renderDir(sec, activeSlug) {
    if (!sec) return "";
    if (sec.directions && sec.directions.length) {
      return sec.directions.map(function (d) {
        var on = d.slug === activeSlug ? " active" : "";
        return '<a class="cm-dir' + on + '" data-dir="' + esc(d.slug) + '" href="' + abs(d.url) + '"><span>' + esc(d.title) + '</span><i class="cm-caret"></i></a>';
      }).join("");
    }
    return (sec.groups || []).map(function (g) {
      return '<a class="cm-dir" href="' + abs(g.url) + '"><span>' + esc(g.name) + '</span></a>';
    }).join("");
  }
  function renderPanel(dir) {
    if (!dir || !dir.nodes || !dir.nodes.length) return '<div class="cm-empty">Выберите направление слева.</div>';
    var blocks = [];
    dir.nodes.forEach(function (nd) {
      if (nd.type === "group") {
        var lis = (nd.children || []).map(function (c) { return '<li><a href="' + abs(c.url) + '">' + esc(c.name) + '</a></li>'; }).join("");
        blocks.push('<div class="cm-block"><a class="cm-block-h" href="' + abs(nd.url) + '">' + esc(nd.title) + '</a><ul>' + lis + '</ul></div>');
      }
    });
    var cats = dir.nodes.filter(function (nd) { return nd.type === "category"; });
    if (cats.length) {
      var lis2 = cats.map(function (c) { return '<li><a href="' + abs(c.url) + '">' + esc(c.title) + '</a></li>'; }).join("");
      var head = blocks.length ? '<div class="cm-block-h cm-block-h--muted">Ещё в направлении</div>' : "";
      blocks.push('<div class="cm-block">' + head + '<ul>' + lis2 + '</ul></div>');
    }
    return blocks.join("");
  }
  function renderWall(sec) {
    if (!sec) return "";
    if (!sec.directions || !sec.directions.length) {
      return '<div class="cm-block"><ul>' + (sec.groups || []).map(function (g) { return '<li><a href="' + abs(g.url) + '">' + esc(g.name) + '</a></li>'; }).join("") + '</ul></div>';
    }
    return sec.directions.map(function (d) {
      var inner = (d.nodes || []).map(function (nd) {
        if (nd.type === "group") return '<li><a href="' + abs(nd.url) + '">' + esc(nd.title) + '</a></li>';
        return '<li><a href="' + abs(nd.url) + '">' + esc(nd.title) + '</a></li>';
      }).join("");
      return '<div class="cm-block"><a class="cm-block-h" href="' + abs(d.url) + '">' + esc(d.title) + '</a><ul>' + inner + '</ul></div>';
    }).join("");
  }

  // ---------- состояние ----------
  function setAud(slug, drill) {
    activeAud = slug;
    var sec = findSec(slug);
    Array.prototype.forEach.call(colAud.children, function (a) { a.classList.toggle("active", a.getAttribute("data-aud") === slug); });
    colDir.innerHTML = renderDir(sec, null);
    var first = sec && sec.directions && sec.directions[0];
    activeDir = first ? first.slug : null;
    if (first && colDir.firstChild && colDir.firstChild.classList) colDir.firstChild.classList.add("active");
    colPanel.innerHTML = renderPanel(findDir(sec, activeDir));
    if (drill && isMobile()) goLevel(1);
  }
  function setDir(slug, drill) {
    activeDir = slug;
    var sec = findSec(activeAud);
    Array.prototype.forEach.call(colDir.children, function (a) { a.classList.toggle("active", a.getAttribute("data-dir") === slug); });
    colPanel.innerHTML = renderPanel(findDir(sec, slug));
    if (drill && isMobile()) goLevel(2);
  }

  // ---------- mobile drill-down ----------
  function goLevel(l) { level = l; mega.setAttribute("data-level", String(l)); updateBackbar(); }
  function updateBackbar() {
    if (!isMobile() || level === 0) { backbar.hidden = true; return; }
    backbar.hidden = false;
    var sec = findSec(activeAud);
    backbar.querySelector(".cm-back-label").textContent = level === 1 ? (sec ? sec.title : "") : ((findDir(sec, activeDir) || {}).title || "");
  }

  function buildShell() {
    mega = document.createElement("div");
    mega.className = "catalog-mega cm-mode-" + (settings.render_mode || "cascade");
    mega.setAttribute("data-level", "0");
    mega.hidden = true;
    mega.innerHTML =
      '<div class="catalog-mega-backdrop"></div>' +
      '<div class="catalog-mega-panel"><button type="button" class="cm-close" aria-label="Закрыть каталог">✕</button>' +
      '<div class="cm-backbar" hidden><button type="button" class="cm-back">‹ Назад</button><span class="cm-back-label"></span></div>' +
      '<div class="wrap cm-cascade">' +
      '<nav class="cm-col cm-col-aud"></nav><nav class="cm-col cm-col-dir"></nav><div class="cm-col cm-col-panel"></div>' +
      '</div></div>';
    document.body.appendChild(mega);
    colAud = mega.querySelector(".cm-col-aud");
    colDir = mega.querySelector(".cm-col-dir");
    colPanel = mega.querySelector(".cm-col-panel");
    backbar = mega.querySelector(".cm-backbar");
    mega.querySelector(".catalog-mega-backdrop").addEventListener("click", close);
    mega.querySelector(".cm-close").addEventListener("click", close);
    mega.querySelector(".cm-back").addEventListener("click", function () { goLevel(Math.max(0, level - 1)); });

    colAud.addEventListener("mouseover", function (e) { var a = e.target.closest && e.target.closest(".cm-aud"); if (a && !isMobile()) setAud(a.getAttribute("data-aud")); });
    colAud.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest(".cm-aud"); if (a && isMobile()) { e.preventDefault(); setAud(a.getAttribute("data-aud"), true); } });
    colDir.addEventListener("mouseover", function (e) {
      var a = e.target.closest && e.target.closest(".cm-dir[data-dir]"); if (!a || isMobile()) return;
      clearTimeout(hoverTimer); var slug = a.getAttribute("data-dir");
      hoverTimer = setTimeout(function () { setDir(slug); }, settings.hover_intent_ms || 180);
    });
    colDir.addEventListener("mouseout", function () { clearTimeout(hoverTimer); });
    colDir.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest(".cm-dir[data-dir]"); if (a && isMobile()) { e.preventDefault(); setDir(a.getAttribute("data-dir"), true); } });
  }

  function render() {
    colAud.innerHTML = renderAud(data.sections, activeAud);
    if (settings.render_mode === "wall") { colDir.innerHTML = ""; colPanel.innerHTML = renderWall(findSec(activeAud || (data.sections[0] || {}).slug)); if (!activeAud && data.sections[0]) { activeAud = data.sections[0].slug; colAud.innerHTML = renderAud(data.sections, activeAud); } return; }
    if (activeAud) setAud(activeAud); else if (data.sections[0]) setAud(data.sections[0].slug);
  }

  function position() {
    var st = document.querySelector(".site-top");
    var top = st ? Math.max(0, Math.round(st.getBoundingClientRect().bottom)) : 110;
    mega.style.setProperty("--cm-top", top + "px");
  }
  function setBtn(on) { btns().forEach(function (b) { b.classList.toggle("open", on); b.setAttribute("aria-expanded", on ? "true" : "false"); }); }
  function open() { if (!data) { load(); return; } position(); goLevel(0); mega.hidden = false; document.body.classList.add("cm-open"); setBtn(true); }
  function close() { if (mega) mega.hidden = true; document.body.classList.remove("cm-open"); setBtn(false); }
  function toggle() { if (mega && !mega.hidden) close(); else open(); }

  function load() {
    if (loading) return; loading = true;
    fetch(BASE + "menu.json", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        data = j && Array.isArray(j.sections) ? j : { settings: settings, sections: [] };
        if (data.settings) settings = Object.assign(settings, data.settings);
        buildShell(); render(); loading = false; open();
      })
      .catch(function () { loading = false; });
  }

  function init() {
    btns().forEach(function (b) { b.setAttribute("aria-expanded", "false"); b.addEventListener("click", function (e) { e.preventDefault(); toggle(); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (mega && !mega.hidden) { position(); updateBackbar(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
