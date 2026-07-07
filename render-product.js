/**
 * Общий модуль рендера тела страницы товара.
 * Используется И сборщиком (build.mjs, Node), И браузером (живая подгрузка) —
 * один код, никакого расхождения «запечённого» HTML и обновления на лету.
 * Только чистый JS, без Node-зависимостей.
 */
export const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: "\u00A0", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  laquo: "\u00AB", raquo: "\u00BB", copy: "\u00A9", reg: "\u00AE",
  trade: "\u2122", deg: "\u00B0", times: "\u00D7", middot: "\u00B7",
  rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D",
  sbquo: "\u201A", bdquo: "\u201E", plusmn: "\u00B1", frac12: "\u00BD",
};
export const decodeEntities = (s) =>
  String(s == null ? "" : s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, code) => {
    if (code[0] === "#") {
      const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? m : String.fromCodePoint(n);
    }
    const v = NAMED_ENTITIES[code] != null ? NAMED_ENTITIES[code] : NAMED_ENTITIES[code.toLowerCase()];
    return v != null ? v : m;
  });
export const stripHtml = (s) =>
  decodeEntities(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export function crumbs(items) {
  // items: [{name, href?}]; элемент без href — текущая страница (не ссылка)
  const sep = '<span class="crumb-sep" aria-hidden="true">\u203a</span>';
  const parts = items.map(function (it) {
    return it.href
      ? `<a href="${esc(it.href)}">${esc(it.name)}</a>`
      : `<span aria-current="page">${esc(it.name)}</span>`;
  });
  return `<nav class="crumbs" aria-label="\u0425\u043b\u0435\u0431\u043d\u044b\u0435 \u043a\u0440\u043e\u0448\u043a\u0438">${parts.join(sep)}</nav>`;
}
export const fmtDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};
export const docValidity = (d) =>
  d.is_perpetual ? "Бессрочный" : d.valid_until ? "Действует до " + fmtDate(d.valid_until) : "";
export function flag(code) {
  if (!code || code.length !== 2) return "";
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
export function specValue(ch) {
  let v = ch.value;
  if (Array.isArray(v)) v = v.join(", ");
  else if (v === true) v = "Да";
  else if (v === false) v = "Нет";
  if (v === null || v === undefined || v === "") return "—";
  return esc(v) + (ch.unit ? " " + esc(ch.unit) : "");
}
export const mainImage = (p) => (p.images && p.images[0] ? p.images[0].image : p.thumbnail || null);

// Цена «1 234,56 ₽» (неразрывные пробелы; копейки — только если есть)
export const fmtPrice = (v) => {
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  let rub = Math.floor(Math.abs(n));
  let kop = Math.round((Math.abs(n) - rub) * 100);
  if (kop === 100) { rub += 1; kop = 0; }
  const s = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return (n < 0 ? "\u2212" : "") + s + (kop > 0 ? "," + String(kop).padStart(2, "0") : "") + "\u00A0\u20bd";
};

// Компактный блок покупки для сайдбара: сегменты пилюлями (CSS-only) + условия стопкой.
export function purchaseSidebar(p, activeRole) {
  const order = ["individuals", "clinics", "distributors", "government"];
  const byCh = {};
  (p.offers || []).forEach((o) => {
    (o.terms || []).forEach((t) => {
      (byCh[t.channel] = byCh[t.channel] || { name: t.channel_display, rows: [] })
        .rows.push(Object.assign({}, t, { in_stock: o.in_stock }));
    });
  });
  const chans = order.filter((c) => byCh[c]);
  if (!chans.length) return "";

  let activeIdx = activeRole ? chans.indexOf(activeRole) : 0;
  if (activeIdx < 0) activeIdx = 0;
  let radios = "", pills = "", panels = "";
  chans.forEach((c, i) => {
    const grp = byCh[c];
    radios += `<input type="radio" name="pseg" id="pseg-${i}" class="bb-radio"${i === activeIdx ? " checked" : ""}>`;
    pills += `<label class="bb-pill" for="pseg-${i}">${esc(grp.name)}</label>`;
    const opts = grp.rows.map((t) => {
      const pack = t.unit_base_qty > 1 ? ` · ${t.unit_base_qty} шт в упаковке` : "";
      const pp = t.unit_base_qty > 1 ? `<span class="bb-pp">${fmtPrice(t.per_piece)}/шт</span>` : "";
      const stock = t.in_stock ? `<span class="bb-in">в наличии</span>` : `<span class="bb-out">под заказ</span>`;
      return `<div class="bb-opt">` +
        `<div class="bb-opt-row"><span class="bb-opt-unit">${esc(t.unit_name)}${pack}</span>` +
        `<span class="bb-opt-price">${fmtPrice(t.price)}</span></div>` +
        `<div class="bb-opt-meta">${pp}<span class="bb-opt-terms">от ${t.min_qty} · шаг ${t.step}</span>${stock}</div>` +
        `</div>`;
    }).join("");
    panels += `<div class="bb-panel">${opts}</div>`;
  });
  return radios + `<div class="bb-seg">${pills}</div><div class="bb-panels">${panels}</div>`;
}

// Блок «Обучение»: курсы с модулями (слайды/видео/лонгрид). Плеер — в course.js.
function educationBlock(p) {
  const courses = (p.courses || []).filter((c) => c && c.modules && c.modules.length);
  if (!courses.length) return "";
  const BTN = { slides: "Пройти", video: "Смотреть", longread: "Читать" };
  const LABEL = { slides: "Слайды", video: "Видео", longread: "Статья" };
  let cards = "";
  courses.forEach((c, ci) => {
    const mods = c.modules.map((m, mi) => {
      const kind = m.kind || "slides";
      return `<div class="edu-mod">` +
        `<div class="edu-mod-info"><span class="edu-mod-title">${esc(m.title || LABEL[kind] || "")}</span>` +
        `<span class="edu-mod-kind">${esc(LABEL[kind] || "")}</span></div>` +
        `<div class="edu-mod-right"><span class="edu-badge">не пройдено</span>` +
        `<button type="button" class="edu-go" data-edu-launch data-course="${ci}" data-module="${mi}">${esc(BTN[kind] || "Открыть")}</button></div>` +
        `</div>`;
    }).join("");
    cards += `<div class="edu-course">` +
      `<div class="edu-head"><span class="edu-tag">Обучение</span><h2 class="edu-title">${esc(c.title)}</h2>` +
      (c.subtitle ? `<div class="edu-sub">${esc(c.subtitle)}</div>` : "") + `</div>` +
      `<div class="edu-mods">${mods}</div></div>`;
  });
  const json = JSON.stringify(courses).replace(/</g, "\\u003c");
  return `<section class="edu">${cards}<script type="application/json" id="courses-data">${json}</script></section>`;
}

/** Внутренний HTML <main class="product-shell"> — крошка + верх + секции. */
export function productMain(p, SITE_BASE, categoryTrail, activeRole) {
  const imgs = p.images || [];
  const main = mainImage(p);

  // галерея: вертикальные превью + главное фото
  let thumbs = "";
  if (imgs.length > 1) {
    thumbs = `<div class="pthumbs">` + imgs.map((im, i) =>
      `<span class="pthumb${i === 0 ? " active" : ""}"><img src="${esc(im.image)}" alt="${esc(im.alt || "")}" loading="lazy"></span>`
    ).join("") + `</div>`;
  }
  const gallery = main
    ? `<div class="pgallery">${thumbs}<div class="pmain"><img src="${esc(main)}" alt="${esc(p.name)}"></div></div>`
    : `<div class="pgallery"><div class="pmain pmain--empty">без фото</div></div>`;

  // инфо-колонка
  let info = `<div class="p-info">`;
  if (p.manufacturer_sku) info += `<div class="p-art">Артикул: <b>${esc(p.manufacturer_sku)}</b></div>`;
  info += `<h1 class="ptitle">${esc(p.name)}</h1>`;
  if (p.brand && p.brand.name) info += `<a class="p-brand" href="${SITE_BASE}/brand/${esc(p.brand.slug)}/">${esc(p.brand.name)}</a>`;
  if (p.short_description) info += `<p class="plede">${esc(p.short_description)}</p>`;

  // варианты — из p.group, сгруппированы по уровням. Поддерживаем обе формы данных:
  // новую (v.level — имя одного уровня) и старую (v.levels — словарь уровень→значение).
  if (p.group && p.group.variants && p.group.variants.length > 1) {
    const levels = p.group.levels || [];
    const levelOf = (v) => {
      if (v.level != null) return v.level;
      if (v.levels) { const k = Object.keys(v.levels); return k.length ? k[0] : null; }
      return null;
    };
    const chip = (v) => {
      const t = esc(v.label || v.name || "\u2014");
      return v.is_current
        ? `<span class="p-opt active">${t}</span>`
        : `<a class="p-opt" href="${SITE_BASE}/product/${esc(v.slug)}/">${t}</a>`;
    };
    let vrows = "";
    levels.forEach((lvl) => {
      const lvlName = lvl && lvl.name;
      if (!lvlName) return;
      const members = p.group.variants.filter((v) => levelOf(v) === lvlName);
      if (!members.length) return;
      vrows += `<div class="p-variant"><div class="p-vlabel">${esc(lvlName)}</div><div class="p-opts">` +
        members.map(chip).join("") + `</div></div>`;
    });
    // фолбэк: уровней нет или варианты к ним не привязаны — плоский список
    if (!vrows) {
      vrows = `<div class="p-variant"><div class="p-vlabel">Другие варианты</div><div class="p-opts">` +
        p.group.variants.map(chip).join("") + `</div></div>`;
    }
    info += vrows;
  }

  // характеристики + идентификаторы
  const charRows = (p.characteristics || []).map((c) =>
    `<tr><td>${esc(c.name)}</td><td>${specValue(c)}</td></tr>`);
  if (p.category && p.category.name) charRows.push(`<tr><td>Категория</td><td>${esc(p.category.name)}</td></tr>`);
  if (p.country_of_origin) charRows.push(`<tr><td>Страна</td><td>${flag(p.country_of_origin.code)} ${esc(p.country_of_origin.name)}</td></tr>`);
  if (p.gtin) charRows.push(`<tr><td>Штрих-код (GTIN)</td><td class="mono">${esc(p.gtin)}</td></tr>`);
  if (p.tnved_code) charRows.push(`<tr><td>Код ТН ВЭД</td><td class="mono">${esc(p.tnved_code)}</td></tr>`);
  if (charRows.length) info += `<div class="p-chars"><div class="p-vlabel">Характеристики</div><table class="ctable"><tbody>${charRows.join("")}</tbody></table></div>`;
  info += `</div>`;

  // блок покупки (сайдбар): цена «от», сегменты, условия, корзина
  const hasOffers = (p.offers || []).some((o) => (o.terms || []).length);
  const bbPrice = p.price_from ? `от ${fmtPrice(p.price_from)}` : "Цена по запросу";
  const buybox = `<aside class="buybox">` +
    `<div class="bb-price">${bbPrice}</div>` +
    purchaseSidebar(p, activeRole) +
    `<button type="button" class="bb-cart" title="Корзина — скоро"><img src="${SITE_BASE}/ic-cart-sm.svg" alt="" width="14" height="13"><span>В корзину</span></button>` +
    `<ul class="bb-feats">` +
      `<li><img src="${SITE_BASE}/ic-delivery.svg" alt="" width="14" height="14"><span>Доставка от 1 дня</span></li>` +
      `<li><img src="${SITE_BASE}/ic-bonus.svg" alt="" width="13" height="13"><span>Бонусы за каждый заказ</span></li>` +
    `</ul>` +
    (hasOffers ? `<div class="bb-demo">Демо: показаны все каналы продаж</div>`
               : `<div class="bb-demo">Наличие и цену уточняйте</div>`) +
  `</aside>`;

  // табы: Описание / Документы / Файлы (CSS-only, без JS)
  const descHtml = p.full_description ? `<div class="rich">${p.full_description}</div>` : `<p class="tab-empty">Описание появится позже.</p>`;
  let logi = "";
  const lg = p.logistics || {};
  if (lg.gross_width_mm || lg.gross_height_mm || lg.gross_depth_mm || lg.gross_weight_kg) {
    logi = `<table class="ctable logi"><tbody><tr><td colspan="2"><b>Логистика (брутто)</b></td></tr>`;
    if (lg.gross_width_mm) logi += `<tr><td>Ширина</td><td>${esc(lg.gross_width_mm)} мм</td></tr>`;
    if (lg.gross_height_mm) logi += `<tr><td>Высота</td><td>${esc(lg.gross_height_mm)} мм</td></tr>`;
    if (lg.gross_depth_mm) logi += `<tr><td>Глубина</td><td>${esc(lg.gross_depth_mm)} мм</td></tr>`;
    if (lg.gross_weight_kg) logi += `<tr><td>Масса</td><td>${esc(lg.gross_weight_kg)} кг</td></tr>`;
    logi += `</tbody></table>`;
  }
  const docsHtml = (p.documents && p.documents.length)
    ? `<div class="doc-grid">` + p.documents.map((d) => {
        const sub = [];
        if (d.number) sub.push("№ " + esc(d.number));
        const val = docValidity(d);
        if (val) sub.push(esc(val));
        return `<a class="doc-tile" href="${esc(d.file)}" target="_blank" rel="noopener"><span class="doc-ic">PDF</span><span class="doc-meta"><span class="doc-type">${esc(d.doc_type_display || "Документ")}</span>${sub.length ? `<span class="doc-sub">${sub.join(" · ")}</span>` : ""}</span><span class="doc-dl">скачать</span></a>`;
      }).join("") + `</div>`
    : `<p class="tab-empty">Документов нет.</p>`;

  const tabs = `<div class="product-tabs">` +
    `<input type="radio" name="ptab" id="ptab-desc" class="ptab-r" checked>` +
    `<input type="radio" name="ptab" id="ptab-docs" class="ptab-r">` +
    `<input type="radio" name="ptab" id="ptab-files" class="ptab-r">` +
    `<div class="ptab-labels"><label for="ptab-desc">Описание</label><label for="ptab-docs">Документы</label><label for="ptab-files">Файлы</label></div>` +
    `<div class="ptab-panel ptab-desc">${descHtml}${logi}</div>` +
    `<div class="ptab-panel ptab-docs">${docsHtml}</div>` +
    `<div class="ptab-panel ptab-files"><p class="tab-empty">Раздел файлов появится позже.</p></div>` +
  `</div>`;

  const trail = [{ name: "Каталог", href: SITE_BASE + "/" }];
  if (categoryTrail && categoryTrail.length) categoryTrail.forEach((c) => trail.push({ name: c.name, href: SITE_BASE + "/c/" + c.slug + "/" }));
  else if (p.category && p.category.slug) trail.push({ name: p.category.name, href: SITE_BASE + "/c/" + p.category.slug + "/" });
  trail.push({ name: p.name });

  return `${crumbs(trail)}
  <div class="product-top"><div class="product-main-card">${gallery}${info}</div>${buybox}</div>
  ${educationBlock(p)}
  ${tabs}`;
}
