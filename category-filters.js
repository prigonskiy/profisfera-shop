/* Панель фильтров на странице категории.
 * Читает встроенный JSON (#category-filters-data), рисует фильтры (бренд по
 * умолчанию + категорийные из PIM), фильтрует сетку товаров на клиенте,
 * показывает счётчики, сброс и держит состояние в query-string.
 * Без зависимостей, обычный скрипт (defer). */
(function () {
  "use strict";

  var dataEl = document.getElementById("category-filters-data");
  var panel = document.getElementById("filters");
  var grid = document.getElementById("cat-grid");
  var countEl = document.getElementById("cat-count");
  if (!dataEl || !panel || !grid) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  // карточки + их slug (из href /product/<slug>/)
  var cards = Array.prototype.map.call(grid.querySelectorAll("a.card"), function (el) {
    var m = el.getAttribute("href").match(/\/product\/([^\/]+)\/?/);
    return { el: el, slug: m ? decodeURIComponent(m[1]) : null };
  });
  var values = data.values || {};

  // описания фильтров: бренд (если брендов >1) + категорийные
  var defs = [];
  if (data.brands && data.brands.length > 1) {
    defs.push({ key: "brand", code: "brand", name: "Производитель",
                display: "select_checkbox", options: data.brands, unit: "" });
  }
  (data.filters || []).forEach(function (f) {
    var opts = (f.options || []).map(function (o) {
      return (o && typeof o === "object") ? o.value : o; // API отдаёт строки; подстрахуемся под {value}
    });
    defs.push({ key: f.code, code: f.code, name: f.name, display: f.display,
                unit: f.unit || "", options: opts, buckets: f.buckets || [] });
  });
  if (!defs.length) return;

  // состояние
  var state = {};
  defs.forEach(function (d) {
    state[d.key] = d.display === "number_range" ? { min: null, max: null } : { set: {} };
  });

  function prodVal(slug, code) {
    var v = values[slug];
    if (!v) return undefined;
    return code === "brand" ? v.brand : v[code];
  }
  function setHas(set, key) { return Object.prototype.hasOwnProperty.call(set, key); }
  function setSize(set) { return Object.keys(set).length; }

  function bucketLabel(b) {
    var lo = (b.min === null || b.min === undefined) ? null : b.min;
    var hi = (b.max === null || b.max === undefined) ? null : b.max;
    if (lo === null && hi !== null) return "до " + hi;
    if (lo !== null && hi === null) return "от " + lo;
    return "от " + lo + " до " + hi;
  }

  // проходит ли товар один фильтр при состоянии st
  function passes(slug, d, st) {
    var val = prodVal(slug, d.code);
    if (d.display === "number_range") {
      if (st.min === null && st.max === null) return true;
      var num = parseFloat(val);
      if (val == null || val === "" || isNaN(num)) return false;
      if (st.min !== null && num < st.min) return false;
      if (st.max !== null && num > st.max) return false;
      return true;
    }
    if (setSize(st.set) === 0) return true;
    if (d.display === "number_buckets") {
      var n = parseFloat(val);
      if (val == null || isNaN(n)) return false;
      var ok = false;
      Object.keys(st.set).forEach(function (i) {
        var b = d.buckets[i]; if (!b) return;
        var lo = (b.min == null) ? -Infinity : b.min;
        var hi = (b.max == null) ? Infinity : b.max;
        if (n >= lo && n <= hi) ok = true;
      });
      return ok;
    }
    if (d.display === "bool_checkbox") return val === true;
    if (d.display === "bool_yesno") {
      var s = val === true ? "yes" : (val === false ? "no" : null);
      return s !== null && setHas(st.set, s);
    }
    // select_checkbox (в т.ч. бренд); multi_select -> массив значений
    if (Array.isArray(val)) {
      for (var i = 0; i < val.length; i++) if (setHas(st.set, String(val[i]))) return true;
      return false;
    }
    return val != null && setHas(st.set, String(val));
  }

  // проходит все фильтры, кроме exceptKey (для подсчёта вариантов)
  function passesAll(slug, exceptKey) {
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (d.key === exceptKey) continue;
      if (!passes(slug, d, state[d.key])) return false;
    }
    return true;
  }

  // сколько товаров подойдёт, если в фильтре d дополнительно учесть predicate(value)
  function countOption(d, predicate) {
    var c = 0;
    for (var i = 0; i < cards.length; i++) {
      var s = cards[i].slug;
      if (!s) continue;
      if (!passesAll(s, d.key)) continue;
      if (predicate(prodVal(s, d.code))) c++;
    }
    return c;
  }

  // сколько товаров в категории вообще имеют это значение (без учёта фильтров) —
  // для стабильной сортировки «по популярности» и отсечения пустых значений
  function baseCount(d, opt) {
    var c = 0;
    for (var i = 0; i < cards.length; i++) {
      var s = cards[i].slug; if (!s) continue;
      var v = prodVal(s, d.code);
      if (Array.isArray(v)) { if (v.map(String).indexOf(String(opt)) !== -1) c++; }
      else if (v != null && String(v) === String(opt)) c++;
    }
    return c;
  }

  // ---------- рендер ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function checkboxRow(labelText, key, onChange, getCount) {
    var lab = el("label", "filter-opt");
    var cb = el("input"); cb.type = "checkbox";
    cb.addEventListener("change", function () { onChange(cb.checked); });
    lab.appendChild(cb);
    lab.appendChild(el("span", "opt-name", labelText));
    var cnt = el("span", "opt-count", "");
    lab.appendChild(cnt);
    return { row: lab, cb: cb, cnt: cnt, getCount: getCount };
  }

  var refreshers = []; // функции, обновляющие счётчики/доступность
  var selectGroups = []; // сворачиваемые группы-селекты (>10 значений)
  var SELECT_LIMIT = 10; // сколько значений показывать в свёрнутом виде

  function render() {
    panel.innerHTML = "";
    panel.hidden = false;
    refreshers = [];
    selectGroups = [];
    var head = el("div", "filters-head");
    head.appendChild(el("h2", "filters-title", "Фильтры"));
    var reset = el("button", "filters-reset", "Сбросить");
    reset.type = "button";
    reset.addEventListener("click", clearAll);
    head.appendChild(reset);
    panel.appendChild(head);

    defs.forEach(function (d) {
      var group = el("div", "filter-group");
      group.appendChild(el("h3", "filter-name", d.name + (d.unit ? ", " + d.unit : "")));
      var st = state[d.key];

      if (d.display === "number_range") {
        var wrap = el("div", "range-row");
        var lo = el("input", "range-in"); lo.type = "number"; lo.placeholder = "от";
        var hi = el("input", "range-in"); hi.type = "number"; hi.placeholder = "до";
        if (st.min !== null) lo.value = st.min;
        if (st.max !== null) hi.value = st.max;
        function upd() {
          st.min = lo.value === "" ? null : parseFloat(lo.value);
          st.max = hi.value === "" ? null : parseFloat(hi.value);
          apply();
        }
        lo.addEventListener("change", upd);
        hi.addEventListener("change", upd);
        wrap.appendChild(lo); wrap.appendChild(el("span", "range-dash", "–")); wrap.appendChild(hi);
        group.appendChild(wrap);

      } else if (d.display === "bool_checkbox") {
        var c1 = checkboxRow(d.name, d.key, function (on) {
          st.set = {}; if (on) st.set["yes"] = 1; apply();
        }, function () { return countOption(d, function (v) { return v === true; }); });
        if (setHas(st.set, "yes")) c1.cb.checked = true;
        // подпись группы дублирует имя — заменим текст опции на «Да»
        c1.row.querySelector(".opt-name").textContent = "Да";
        group.appendChild(c1.row); refreshers.push(c1);

      } else if (d.display === "bool_yesno") {
        [["yes", "Да", true], ["no", "Нет", false]].forEach(function (pair) {
          var key = pair[0], lblText = pair[1], boolv = pair[2];
          var c = checkboxRow(lblText, d.key, function (on) {
            if (on) st.set[key] = 1; else delete st.set[key]; apply();
          }, function () { return countOption(d, function (v) { return v === boolv; }); });
          if (setHas(st.set, key)) c.cb.checked = true;
          group.appendChild(c.row); refreshers.push(c);
        });

      } else if (d.display === "number_buckets") {
        d.buckets.forEach(function (b, idx) {
          var c = checkboxRow(bucketLabel(b), d.key, function (on) {
            if (on) st.set[idx] = 1; else delete st.set[idx]; apply();
          }, function () {
            return countOption(d, function (v) {
              var n = parseFloat(v); if (v == null || isNaN(n)) return false;
              var lo = (b.min == null) ? -Infinity : b.min, hi = (b.max == null) ? Infinity : b.max;
              return n >= lo && n <= hi;
            });
          });
          if (setHas(st.set, idx)) c.cb.checked = true;
          group.appendChild(c.row); refreshers.push(c);
        });

      } else { // select_checkbox
        var opts = d.options.map(function (opt) {
          return { opt: opt, base: baseCount(d, opt) };
        }).filter(function (o) {
          return o.base > 0 || setHas(st.set, String(o.opt)); // без товаров — прячем
        }).sort(function (a, b) { return b.base - a.base; });    // популярные выше

        var grp = { rows: [], toggle: null, expanded: false };
        opts.forEach(function (o) {
          var opt = o.opt;
          var c = checkboxRow(String(opt), d.key, function (on) {
            if (on) st.set[String(opt)] = 1; else delete st.set[String(opt)]; apply();
          }, function () {
            return countOption(d, function (v) {
              if (Array.isArray(v)) return v.map(String).indexOf(String(opt)) !== -1;
              return v != null && String(v) === String(opt);
            });
          });
          if (setHas(st.set, String(opt))) c.cb.checked = true;
          group.appendChild(c.row); refreshers.push(c); grp.rows.push(c);
        });

        if (grp.rows.length > SELECT_LIMIT) {
          var more = el("button", "filter-more");
          more.type = "button";
          more.addEventListener("click", function () {
            grp.expanded = !grp.expanded; applyVisibility();
          });
          group.appendChild(more);
          grp.toggle = more;
          selectGroups.push(grp);
        }
      }
      // пустую группу (без единого значения) не показываем
      if (group.querySelector(".filter-opt, .range-row")) panel.appendChild(group);
    });
  }

  // видимость строк селект-групп: прячем пустые значения + сворачиваем длинные списки
  function applyVisibility() {
    selectGroups.forEach(function (grp) {
      var shown = 0, hidden = 0;
      grp.rows.forEach(function (r) {
        if (r._dynEmpty) { r._collapseHidden = false; return; }
        shown++;
        r._collapseHidden = (!grp.expanded && shown > SELECT_LIMIT);
        if (r._collapseHidden) hidden++;
      });
      if (grp.toggle) {
        grp.toggle.style.display = (grp.expanded || hidden > 0) ? "" : "none";
        grp.toggle.textContent = grp.expanded ? "Свернуть" : ("Показать ещё " + hidden);
      }
    });
    refreshers.forEach(function (r) {
      r.row.style.display = (r._dynEmpty || r._collapseHidden) ? "none" : "";
    });
  }

  function clearAll() {
    defs.forEach(function (d) {
      state[d.key] = d.display === "number_range" ? { min: null, max: null } : { set: {} };
    });
    refreshers = [];
    render();
    apply();
  }

  // ---------- применение ----------
  function apply() {
    var visible = 0;
    cards.forEach(function (c) {
      var show = c.slug ? passesAll(c.slug, null) : true;
      c.el.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (countEl) countEl.innerHTML = "<b>" + visible + "</b> товаров";
    refreshers.forEach(function (r) {
      var n = r.getCount();
      r.cnt.textContent = n;
      r._dynEmpty = (n === 0 && !r.cb.checked); // пустое и не выбрано — прячем
    });
    applyVisibility();
    syncURL();
  }

  // ---------- состояние в URL ----------
  function syncURL() {
    var params = new URLSearchParams();
    defs.forEach(function (d) {
      var st = state[d.key];
      if (d.display === "number_range") {
        if (st.min !== null) params.set("f_" + d.key + "_min", st.min);
        if (st.max !== null) params.set("f_" + d.key + "_max", st.max);
      } else {
        var keys = Object.keys(st.set);
        if (keys.length) params.set("f_" + d.key, keys.join(","));
      }
    });
    var qs = params.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function parseURL() {
    var params = new URLSearchParams(location.search);
    defs.forEach(function (d) {
      var st = state[d.key];
      if (d.display === "number_range") {
        var mn = params.get("f_" + d.key + "_min"), mx = params.get("f_" + d.key + "_max");
        if (mn !== null && mn !== "") st.min = parseFloat(mn);
        if (mx !== null && mx !== "") st.max = parseFloat(mx);
      } else {
        var raw = params.get("f_" + d.key);
        if (raw) raw.split(",").forEach(function (k) { if (k !== "") st.set[k] = 1; });
      }
    });
  }

  parseURL();
  render();
  apply();
})();
