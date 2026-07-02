/* Поиск по каталогу.
 * Живая строка в шапке (выпадашка-подсказка) + страница результатов /search/?q=…
 * Индекс — search-index.json, собирается на этапе сборки (build.mjs).
 * Без зависимостей, обычный скрипт (defer). */
(function () {
  "use strict";

  // база сайта — из адреса самого скрипта (как в catalog-menu.js)
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/\/search\.js.*$/, "") : "";
  })();

  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(BASE + "/search-index.json", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return indexPromise;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s == null ? "" : s).toLowerCase(); }
  function tokens(q) { return norm(q).split(/\s+/).filter(Boolean); }

  // товар подходит, если КАЖДЫЙ токен встречается где-то (имя/артикул/бренд/категория)
  function scoreItem(toks, hay) {
    var score = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var inName = hay.name.indexOf(t);
      var hit = inName !== -1 || hay.sku.indexOf(t) !== -1 ||
                hay.brand.indexOf(t) !== -1 || hay.cat.indexOf(t) !== -1;
      if (!hit) return -1;
      if (inName === 0) score += 50;                        // с начала названия
      else if (hay.name.indexOf(" " + t) !== -1) score += 25; // с начала слова в названии
      else if (inName !== -1) score += 10;                  // где-то в названии
      if (hay.sku.indexOf(t) !== -1) score += 8;
      if (hay.brand.indexOf(t) !== -1) score += 4;
      if (hay.cat.indexOf(t) !== -1) score += 2;
    }
    return score;
  }

  function search(items, q) {
    var toks = tokens(q);
    if (!toks.length) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var hay = { name: norm(it.name), sku: norm(it.sku), brand: norm(it.brand), cat: norm(it.cat) };
      var sc = scoreItem(toks, hay);
      if (sc >= 0) out.push({ it: it, sc: sc });
    }
    out.sort(function (a, b) {
      return b.sc - a.sc || String(a.it.name).localeCompare(String(b.it.name), "ru");
    });
    return out.map(function (o) { return o.it; });
  }

  // карточка товара (повторяет productTile из build.mjs)
  function tile(p) {
    var thumb = p.thumb
      ? '<div class="card-img"><img src="' + esc(p.thumb) + '" alt="' + esc(p.name) + '" loading="lazy"></div>'
      : '<div class="card-img"><span class="noimg">без фото</span></div>';
    var sku = p.sku ? '<div class="card-sku">Артикул: ' + esc(p.sku) + '</div>' : '';
    var brand = p.brand ? '<div class="card-brand">' + esc(p.brand) + '</div>' : '';
    return '<a class="card pcard" href="' + BASE + '/product/' + encodeURIComponent(p.slug) + '/">' + thumb +
      '<div class="card-body">' + sku + '<div class="card-price">Цена по запросу</div>' +
      '<div class="card-name">' + esc(p.name) + '</div>' + brand +
      '<div class="card-delivery"><img src="' + BASE + '/ic-delivery.svg" alt="" width="14" height="14"><span>Доставка от 1 дня</span></div></div>' +
      '<span class="btn-cart" title="Корзина — скоро"><img src="' + BASE + '/ic-cart-sm.svg" alt="" width="14" height="13"><span>В корзину</span></span></a>';
  }

  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  // ---------- строка поиска в шапке: выпадашка-подсказка ----------
  function initHeader() {
    var forms = document.querySelectorAll("form.search");
    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector(".search-input");
      if (!input) return;
      var menu = document.createElement("div");
      menu.className = "search-menu";
      menu.hidden = true;
      form.appendChild(menu);

      function close() { menu.hidden = true; menu.innerHTML = ""; }

      function suggest() {
        var q = input.value.trim();
        if (q.length < 2) { close(); return; }
        loadIndex().then(function (items) {
          if (input.value.trim() !== q) return; // ввод изменился — этот результат устарел
          var res = search(items, q).slice(0, 8);
          if (!res.length) {
            menu.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
          } else {
            menu.innerHTML = res.map(function (p) {
              return '<a class="sug" href="' + BASE + '/product/' + encodeURIComponent(p.slug) + '/">' +
                '<span class="sug-name">' + esc(p.name) + '</span>' +
                (p.sku ? '<span class="sug-sku">Артикул: ' + esc(p.sku) + '</span>' : '') +
                '</a>';
            }).join("") +
            '<button type="submit" class="sug-all">Показать все результаты</button>';
          }
          menu.hidden = false;
        });
      }

      input.addEventListener("input", suggest);
      input.addEventListener("focus", function () { if (input.value.trim().length >= 2) suggest(); });
      input.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
      document.addEventListener("click", function (e) { if (!form.contains(e.target)) close(); });
    });
  }

  // ---------- страница результатов /search/ ----------
  function initResults() {
    var box = document.getElementById("search-results");
    if (!box) return;
    var countEl = document.getElementById("search-count");
    var q = (new URLSearchParams(location.search).get("q") || "").trim();

    var input = document.querySelector(".search-input");
    if (input) input.value = q;

    if (!q) {
      if (countEl) countEl.textContent = "Введите запрос в строке поиска выше.";
      return;
    }
    document.title = "Поиск: " + q + " — ПрофиСфера";
    if (countEl) countEl.textContent = "Ищем…";
    loadIndex().then(function (items) {
      var res = search(items, q);
      if (countEl) {
        countEl.textContent = res.length
          ? ("По запросу «" + q + "» — " + res.length + " " + plural(res.length, "товар", "товара", "товаров"))
          : ("По запросу «" + q + "» ничего не найдено. Попробуйте другой запрос или загляните в каталог.");
      }
      box.innerHTML = res.map(tile).join("");
    });
  }

  initHeader();
  initResults();
})();
