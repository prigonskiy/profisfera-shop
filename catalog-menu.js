/**
 * Мегаменю «Каталог». Два вида, переключаются ссылкой внизу панели:
 *   canonical (ПО УМОЛЧАНИЮ) — каноническое дерево Материалы/Инструменты/Оборудование
 *       → семейства → листовые категории. Источник: tree.json. Ссылки на /c/<slug>/.
 *   audience — «по специалистам и направлениям» (аудитории → направления → узлы).
 *       Источник: menu.json. Наработка сохранена, но спрятана за переключателем.
 * Вид не запоминается между загрузками: по умолчанию всегда каноническое дерево,
 * чтобы коллеги не отвлекались на ранний вид. Каскад/hover-intent/drill-down общие.
 */
(function () {
  "use strict";
  var BASE = new URL(".", document.currentScript.src).href;

  var tree = null, menu = null;
  var settings = { render_mode: "cascade", hover_intent_ms: 180, mobile: "drill-down" };
  var view = "canonical"; // "canonical" | "audience"
  var mega = null, colAud = null, colDir = null, colPanel = null, backbar = null, footer = null;
  var activeRoot = null, activeAud = null, activeDir = null, level = 0, hoverTimer = null, loading = false;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function abs(u) { return BASE + String(u == null ? "" : u).replace(/^\//, ""); }
  function curl(slug) { return abs("/c/" + slug + "/"); }
  function btns() { return Array.prototype.slice.call(document.querySelectorAll(".nav-catalog")); }
  function isMobile() { return window.matchMedia("(max-width: 760px)").matches; }
  function byslug(list, slug) { for (var i = 0; i < (list || []).length; i++) if (list[i].slug === slug) return list[i]; return null; }
  function findDir(sec, slug) { return sec ? byslug(sec.directions, slug) : null; }

  // ---------- CANONICAL (дерево) ----------
  function renderRoots() {
    colAud.innerHTML = (tree || []).map(function (r) {
      var on = r.slug === activeRoot ? " active" : "";
      return '<a class="cm-aud' + on + '" data-root="' + esc(r.slug) + '" href="' + curl(r.slug) + '"><span>' + esc(r.name) + '</span><i class="cm-caret"></i></a>';
    }).join("");
  }
  function rootBlocks(root) {
    if (!root || !(root.children || []).length) return '<div class="cm-empty">Раздел пока пуст.</div>';
    return root.children.map(function (fam) {
      var leaves = fam.children || [];
      var head = '<a class="cm-block-h" href="' + curl(fam.slug) + '">' + esc(fam.name) + '</a>';
      if (!leaves.length) return '<div class="cm-block">' + head + '</div>';
      var lis = leaves.map(function (l) { return '<li><a href="' + curl(l.slug) + '">' + esc(l.name) + '</a></li>'; }).join("");
      return '<div class="cm-block">' + head + '<ul>' + lis + '</ul></div>';
    }).join("");
  }
  function setRoot(slug, drill) {
    activeRoot = slug;
    Array.prototype.forEach.call(colAud.children, function (a) { a.classList.toggle("active", a.getAttribute("data-root") === slug); });
    colPanel.innerHTML = rootBlocks(byslug(tree, slug));
    if (drill && isMobile()) goLevel(1);
  }

  // ---------- AUDIENCE (по специалистам) ----------
  function renderAud() {
    colAud.innerHTML = menu.sections.map(function (s) {
      var on = s.slug === activeAud ? " active" : "";
      return '<a class="cm-aud' + on + '" data-aud="' + esc(s.slug) + '" href="' + abs(s.url) + '"><span>' + esc(s.title) + '</span><i class="cm-caret"></i></a>';
    }).join("");
  }
  function renderDir(sec) {
    if (!sec) return "";
    if (sec.directions && sec.directions.length) {
      return sec.directions.map(function (d) {
        var on = d.slug === activeDir ? " active" : "";
        return '<a class="cm-dir' + on + '" data-dir="' + esc(d.slug) + '" href="' + abs(d.url) + '"><span>' + esc(d.title) + '</span><i class="cm-caret"></i></a>';
      }).join("");
    }
    return (sec.groups || []).map(function (g) { return '<a class="cm-dir" href="' + abs(g.url) + '"><span>' + esc(g.name) + '</span></a>'; }).join("");
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
  function setAud(slug, drill) {
    activeAud = slug;
    var sec = byslug(menu.sections, slug);
    Array.prototype.forEach.call(colAud.children, function (a) { a.classList.toggle("active", a.getAttribute("data-aud") === slug); });
    colDir.innerHTML = renderDir(sec);
    var first = sec && sec.directions && sec.directions[0];
    activeDir = first ? first.slug : null;
    if (first && colDir.firstChild && colDir.firstChild.classList) colDir.firstChild.classList.add("active");
    colPanel.innerHTML = renderPanel(findDir(sec, activeDir));
    if (drill && isMobile()) goLevel(1);
  }
  function setDir(slug, drill) {
    activeDir = slug;
    var sec = byslug(menu.sections, activeAud);
    Array.prototype.forEach.call(colDir.children, function (a) { a.classList.toggle("active", a.getAttribute("data-dir") === slug); });
    colPanel.innerHTML = renderPanel(findDir(sec, slug));
    if (drill && isMobile()) goLevel(2);
  }

  // ---------- mobile drill-down ----------
  function goLevel(l) { level = l; mega.setAttribute("data-level", String(l)); updateBackbar(); }
  function updateBackbar() {
    if (!isMobile() || level === 0) { backbar.hidden = true; return; }
    backbar.hidden = false;
    var label = "";
    if (view === "canonical") { var r = byslug(tree, activeRoot); label = r ? r.name : ""; }
    else { var sec = byslug(menu.sections, activeAud); label = level === 1 ? (sec ? sec.title : "") : ((findDir(sec, activeDir) || {}).title || ""); }
    backbar.querySelector(".cm-back-label").textContent = label;
  }

  function render() {
    mega.className = "catalog-mega cm-view-" + view + (view === "audience" ? " cm-mode-" + (settings.render_mode || "cascade") : "");
    if (view === "canonical") {
      renderRoots();
      if (activeRoot && byslug(tree, activeRoot)) setRoot(activeRoot);
      else if (tree[0]) setRoot(tree[0].slug);
    } else {
      renderAud();
      if (activeAud && byslug(menu.sections, activeAud)) setAud(activeAud);
      else if (menu.sections[0]) setAud(menu.sections[0].slug);
    }
    footer.innerHTML = view === "canonical"
      ? '<button type="button" class="cm-viewbtn">Каталог по специалистам и направлениям \u2192</button>'
      : '<button type="button" class="cm-viewbtn">\u2190 Вернуться к каталогу по разделам</button>';
  }
  function toggleView() {
    view = view === "canonical" ? "audience" : "canonical";
    activeRoot = activeAud = activeDir = null;
    goLevel(0);
    render();
  }

  function buildShell() {
    mega = document.createElement("div");
    mega.className = "catalog-mega cm-view-canonical";
    mega.setAttribute("data-level", "0");
    mega.hidden = true;
    mega.innerHTML =
      '<div class="catalog-mega-backdrop"></div>' +
      '<div class="catalog-mega-panel"><button type="button" class="cm-close" aria-label="Закрыть каталог">✕</button>' +
      '<div class="cm-backbar" hidden><button type="button" class="cm-back">‹ Назад</button><span class="cm-back-label"></span></div>' +
      '<div class="wrap cm-cascade">' +
      '<nav class="cm-col cm-col-aud"></nav><nav class="cm-col cm-col-dir"></nav><div class="cm-col cm-col-panel"></div>' +
      '</div><div class="cm-footer"></div></div>';
    document.body.appendChild(mega);
    colAud = mega.querySelector(".cm-col-aud");
    colDir = mega.querySelector(".cm-col-dir");
    colPanel = mega.querySelector(".cm-col-panel");
    backbar = mega.querySelector(".cm-backbar");
    footer = mega.querySelector(".cm-footer");
    mega.querySelector(".catalog-mega-backdrop").addEventListener("click", close);
    mega.querySelector(".cm-close").addEventListener("click", close);
    mega.querySelector(".cm-back").addEventListener("click", function () { goLevel(Math.max(0, level - 1)); });
    footer.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".cm-viewbtn")) { e.preventDefault(); toggleView(); } });

    // левая колонка: корни (canonical) или аудитории (audience)
    colAud.addEventListener("mouseover", function (e) {
      if (isMobile()) return;
      var a = e.target.closest && e.target.closest(".cm-aud"); if (!a) return;
      if (view === "canonical") setRoot(a.getAttribute("data-root")); else setAud(a.getAttribute("data-aud"));
    });
    colAud.addEventListener("click", function (e) {
      if (!isMobile()) return;
      var a = e.target.closest && e.target.closest(".cm-aud"); if (!a) return;
      e.preventDefault();
      if (view === "canonical") setRoot(a.getAttribute("data-root"), true); else setAud(a.getAttribute("data-aud"), true);
    });
    // средняя колонка (только audience): направления с hover-intent
    colDir.addEventListener("mouseover", function (e) {
      var a = e.target.closest && e.target.closest(".cm-dir[data-dir]"); if (!a || isMobile()) return;
      clearTimeout(hoverTimer); var slug = a.getAttribute("data-dir");
      hoverTimer = setTimeout(function () { setDir(slug); }, settings.hover_intent_ms || 180);
    });
    colDir.addEventListener("mouseout", function () { clearTimeout(hoverTimer); });
    colDir.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest(".cm-dir[data-dir]"); if (a && isMobile()) { e.preventDefault(); setDir(a.getAttribute("data-dir"), true); } });
  }

  function position() {
    var st = document.querySelector(".site-top");
    var top = st ? Math.max(0, Math.round(st.getBoundingClientRect().bottom)) : 110;
    mega.style.setProperty("--cm-top", top + "px");
  }
  function setBtn(on) { btns().forEach(function (b) { b.classList.toggle("open", on); b.setAttribute("aria-expanded", on ? "true" : "false"); }); }
  function open() { if (!tree) { load(); return; } position(); goLevel(0); mega.hidden = false; document.body.classList.add("cm-open"); setBtn(true); }
  function close() { if (mega) mega.hidden = true; document.body.classList.remove("cm-open"); setBtn(false); }
  function toggle() { if (mega && !mega.hidden) close(); else open(); }

  function load() {
    if (loading) return; loading = true;
    Promise.all([
      fetch(BASE + "tree.json", { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
      fetch(BASE + "menu.json", { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      tree = Array.isArray(res[0]) ? res[0] : [];
      menu = res[1] && Array.isArray(res[1].sections) ? res[1] : { settings: settings, sections: [] };
      if (menu.settings) settings = Object.assign(settings, menu.settings);
      buildShell(); render(); loading = false; open();
    });
  }

  function init() {
    btns().forEach(function (b) { b.setAttribute("aria-expanded", "false"); b.addEventListener("click", function (e) { e.preventDefault(); toggle(); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (mega && !mega.hidden) { position(); updateBackbar(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
