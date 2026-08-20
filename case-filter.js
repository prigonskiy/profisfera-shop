/**
 * Клиентская фильтрация плиток кейсов в подразделе. Мультивыбор внутри группы (OR),
 * И между группами. Читает data-dirs / data-profile у .case-card, обновляет счётчик.
 * Прячет несовпавшие через display:none — SEO-нейтрально (все кейсы в DOM/sitemap).
 */
(function () {
  "use strict";
  var bar = document.querySelector(".case-filters"); if (!bar) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll(".case-card"));
  var countEl = document.getElementById("case-count");
  var origCount = countEl ? countEl.innerHTML : "";
  var total = parseInt(bar.getAttribute("data-total"), 10) || cards.length;
  var active = { dir: [], profile: [] };

  function matches(card) {
    var dirs = (card.getAttribute("data-dirs") || "").split(/\s+/).filter(Boolean);
    var prof = card.getAttribute("data-profile") || "";
    if (active.dir.length && !active.dir.some(function (v) { return dirs.indexOf(v) >= 0; })) return false;
    if (active.profile.length && active.profile.indexOf(prof) < 0) return false;
    return true;
  }
  function apply() {
    var n = 0;
    cards.forEach(function (c) { var ok = matches(c); c.style.display = ok ? "" : "none"; if (ok) n++; });
    if (countEl) {
      var any = active.dir.length || active.profile.length;
      countEl.innerHTML = any ? ("<b>" + n + "</b> из " + total) : origCount;
    }
  }
  bar.addEventListener("click", function (e) {
    var chip = e.target.closest && e.target.closest(".case-fchip"); if (!chip) return;
    var g = chip.getAttribute("data-group"), v = chip.getAttribute("data-val");
    var arr = active[g]; if (!arr) return;
    var i = arr.indexOf(v);
    if (i >= 0) { arr.splice(i, 1); chip.classList.remove("on"); }
    else { arr.push(v); chip.classList.add("on"); }
    apply();
  });
})();
