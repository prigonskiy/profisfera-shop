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
export const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

/** Внутренний HTML <main class="product-shell"> — крошка + верх + секции. */
export function productMain(p, SITE_BASE) {
  const imgs = p.images || [];
  const main = mainImage(p);
  const general = (p.characteristics || []).filter((c) => c.is_global);
  const cat = (p.characteristics || []).filter((c) => !c.is_global);

  let gallery = `<div class="pgallery">`;
  if (main) {
    gallery += `<div class="pmain"><img src="${esc(main)}" alt="${esc(p.name)}"></div>`;
    if (imgs.length > 1)
      gallery += `<div class="pthumbs">` + imgs.map((im) => `<img src="${esc(im.image)}" alt="${esc(im.alt || "")}" loading="lazy">`).join("") + `</div>`;
  } else {
    gallery += `<div class="pmain pmain--empty">без фото</div>`;
  }
  gallery += `</div>`;

  let summary = `<div class="psummary">`;
  if (p.brand && p.brand.name)
    summary += `<a class="kr2 brandlink-a" href="${SITE_BASE}/brand/${esc(p.brand.slug)}/">${esc(p.brand.name)}</a>`;
  summary += `<h1 class="ptitle">${esc(p.name)}</h1>`;
  const tags = [];
  (p.audiences || []).forEach((a) => tags.push(`<span class="tag2 aud">${esc(a.name)}</span>`));
  (p.directions || []).forEach((d) => tags.push(`<span class="tag2">${esc(d.name)}</span>`));
  if (tags.length) summary += `<div class="dr-tags">${tags.join("")}</div>`;
  if (p.short_description) summary += `<p class="plede">${esc(p.short_description)}</p>`;
  const idRows = [];
  if (p.manufacturer_sku) idRows.push(["Артикул", `<span class="mono">${esc(p.manufacturer_sku)}</span>`]);
  if (p.gtin) idRows.push(["Штрих-код (GTIN)", `<span class="mono">${esc(p.gtin)}</span>`]);
  if (p.tnved_code) idRows.push(["Код ТН ВЭД", `<span class="mono">${esc(p.tnved_code)}</span>`]);
  if (p.country_of_origin) idRows.push(["Страна", flag(p.country_of_origin.code) + " " + esc(p.country_of_origin.name)]);
  if (p.category && p.category.name) idRows.push(["Категория", esc(p.category.name)]);
  if (idRows.length) summary += `<dl class="dl">` + idRows.map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join("") + `</dl>`;
  summary += `</div>`;

  let sections = "";
  if (p.group && p.group.variants && p.group.variants.length > 1) {
    const levelName = (p.group.levels[0] || {}).name;
    const buckets = {};
    p.group.variants.forEach((v) => {
      const key = levelName ? v.levels[levelName] || "—" : "—";
      (buckets[key] = buckets[key] || []).push(v);
    });
    let vh = `<div class="section variants"><h3>Серия «${esc(p.group.name)}»</h3>`;
    Object.keys(buckets).forEach((k) => {
      vh += `<div class="grp">`;
      if (levelName && k !== "—") vh += `<div class="glabel">${esc(levelName)}: ${esc(k)}</div>`;
      vh += `<div class="vrow">` + buckets[k].map((v) =>
        v.is_current
          ? `<span class="vbtn" aria-current="true">${esc(v.label)}</span>`
          : `<a class="vbtn" href="${SITE_BASE}/product/${esc(v.slug)}/">${esc(v.label)}</a>`
      ).join("") + `</div></div>`;
    });
    vh += `</div>`;
    sections += vh;
  }
  if (general.length)
    sections += `<div class="section"><h3>Общие характеристики</h3>` +
      general.map((c) => `<div class="spec"><span class="k">${esc(c.name)}</span><span class="v">${specValue(c)}</span></div>`).join("") + `</div>`;
  if (cat.length)
    sections += `<div class="section"><h3>Характеристики категории</h3>` +
      cat.map((c) => `<div class="spec"><span class="k">${esc(c.name)}</span><span class="v">${specValue(c)}</span></div>`).join("") + `</div>`;
  if (p.full_description)
    sections += `<div class="section"><h3>Описание</h3><div class="rich">${p.full_description}</div></div>`;
  const lg = p.logistics || {};
  if (lg.gross_width_mm || lg.gross_height_mm || lg.gross_depth_mm || lg.gross_weight_kg) {
    let l = `<div class="section"><h3>Логистика (брутто)</h3><dl class="dl">`;
    if (lg.gross_width_mm) l += `<dt>Ширина</dt><dd>${esc(lg.gross_width_mm)} мм</dd>`;
    if (lg.gross_height_mm) l += `<dt>Высота</dt><dd>${esc(lg.gross_height_mm)} мм</dd>`;
    if (lg.gross_depth_mm) l += `<dt>Глубина</dt><dd>${esc(lg.gross_depth_mm)} мм</dd>`;
    if (lg.gross_weight_kg) l += `<dt>Масса</dt><dd>${esc(lg.gross_weight_kg)} кг</dd>`;
    l += `</dl></div>`;
    sections += l;
  }
  if (p.documents && p.documents.length) {
    sections += `<div class="section"><h3>Документы</h3><div class="doc-grid">` +
      p.documents.map((d) => {
        const sub = [];
        if (d.number) sub.push("№ " + esc(d.number));
        const val = docValidity(d);
        if (val) sub.push(esc(val));
        return `<a class="doc-tile" href="${esc(d.file)}" target="_blank" rel="noopener">` +
          `<span class="doc-ic">PDF</span><span class="doc-meta">` +
          `<span class="doc-type">${esc(d.doc_type_display || "Документ")}</span>` +
          (sub.length ? `<span class="doc-sub">${sub.join(" · ")}</span>` : "") +
          `</span><span class="doc-dl">скачать</span></a>`;
      }).join("") + `</div></div>`;
  }

  const trail = [{ name: "Каталог", href: SITE_BASE + "/" }];
  if (p.category && p.category.slug) trail.push({ name: p.category.name, href: SITE_BASE + "/c/" + p.category.slug + "/" });
  trail.push({ name: p.name });
  return `${crumbs(trail)}
  <div class="product-top">${gallery}${summary}</div>
  <div class="product-sections">${sections}</div>`;
}
