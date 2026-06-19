#!/usr/bin/env node
/**
 * ПрофиСфера — генератор статической витрины (SSG).
 *
 * Ходит в PIM API и собирает в каталог _site/:
 *   • product/<slug>/index.html — полноэкранная страница каждого товара
 *     (свой <title>, описание, canonical, Open Graph, «запечённый» контент);
 *   • sitemap.xml, robots.txt;
 *   • копии статики витрины (index.html, app.js, styles.css, product.css, logo.svg).
 *
 * Конфигурация — через переменные окружения (есть разумные значения по умолчанию):
 *   API_BASE   — адрес PIM (по умолчанию https://profisfera-pim.ru)
 *   SITE_BASE  — публичный адрес витрины (для canonical/sitemap)
 *   FIXTURES   — путь к папке с JSON-фикстурами для локальной проверки без сети
 *
 * Запуск:  node build.mjs
 */
import { mkdir, writeFile, copyFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const API_BASE = (process.env.API_BASE || "https://profisfera-pim.ru").replace(/\/$/, "");
const SITE_BASE = (process.env.SITE_BASE || "https://prigonskiy.github.io/profisfera-shop").replace(/\/$/, "");
const FIXTURES = process.env.FIXTURES || null;     // если задано — читаем из файлов, не из сети
const OUT = process.env.OUT || "_site";
const ROOT = path.dirname(new URL(import.meta.url).pathname);

/* ---------- данные: HTTP или фикстуры ---------- */
async function getJSON(apiPath) {
  if (FIXTURES) {
    // apiPath вида "/api/products/<slug>/" → fixtures/products/<slug>.json
    const rel = apiPath.replace(/^\/api\//, "").replace(/\/$/, "");
    const file = path.join(FIXTURES, rel + ".json");
    return JSON.parse(await readFile(file, "utf8"));
  }
  const r = await fetch(API_BASE + apiPath, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} на ${apiPath}`);
  return r.json();
}

async function fetchAllProducts() {
  if (FIXTURES) {
    const list = JSON.parse(await readFile(path.join(FIXTURES, "products.json"), "utf8"));
    return list.results || list;
  }
  let url = "/api/products/?page=1";
  const items = [];
  while (url) {
    const data = await getJSON(url);
    (data.results || data).forEach((p) => items.push(p));
    if (!data.next) break;
    url = data.next.replace(API_BASE, ""); // next — абсолютный URL; берём путь
  }
  return items;
}

/* ---------- утилиты вёрстки ---------- */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const fmtDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};
const docValidity = (d) =>
  d.is_perpetual ? "Бессрочный" : d.valid_until ? "Действует до " + fmtDate(d.valid_until) : "";
function flag(code) {
  if (!code || code.length !== 2) return "";
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
function specValue(ch) {
  let v = ch.value;
  if (Array.isArray(v)) v = v.join(", ");
  else if (v === true) v = "Да";
  else if (v === false) v = "Нет";
  if (v === null || v === undefined || v === "") return "—";
  return esc(v) + (ch.unit ? " " + esc(ch.unit) : "");
}

/* ---------- общий каркас страницы ---------- */
function layout({ title, description, canonical, image, bodyClass, content }) {
  const desc = stripHtml(description).slice(0, 300);
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    desc ? `<meta property="og:description" content="${esc(desc)}">` : "",
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
  ].filter(Boolean).join("\n");
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ""}
<link rel="canonical" href="${esc(canonical)}">
${og}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${SITE_BASE}/styles.css">
<link rel="stylesheet" href="${SITE_BASE}/product.css">
</head>
<body class="${bodyClass || ""}">
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="${SITE_BASE}/" aria-label="ПрофиСфера — на главную">
      <img src="${SITE_BASE}/logo.svg" class="logo-img" alt="ПрофиСфера" width="190" height="19">
      <span class="tag">стоматология · витрина-прототип</span>
    </a>
    <nav class="topnav">
      <a class="navtab" href="${SITE_BASE}/">Каталог</a>
      <a class="navtab" href="${SITE_BASE}/#brands">Производители</a>
    </nav>
    <span class="pim-badge"><span class="dot"></span>данные из PIM в реальном времени</span>
  </div>
</header>
${content}
</body>
</html>
`;
}

/* ---------- страница товара ---------- */
function productPage(p) {
  const canonical = `${SITE_BASE}/product/${p.slug}/`;
  const imgs = p.images || [];
  const main = imgs[0] ? imgs[0].image : p.thumbnail || null;
  const general = (p.characteristics || []).filter((c) => c.is_global);
  const cat = (p.characteristics || []).filter((c) => !c.is_global);

  let gallery = `<div class="pgallery">`;
  if (main) {
    gallery += `<div class="pmain"><img src="${esc(main)}" alt="${esc(p.name)}"></div>`;
    if (imgs.length > 1) {
      gallery += `<div class="pthumbs">` +
        imgs.map((im) => `<img src="${esc(im.image)}" alt="${esc(im.alt || "")}" loading="lazy">`).join("") +
        `</div>`;
    }
  } else {
    gallery += `<div class="pmain pmain--empty">без фото</div>`;
  }
  gallery += `</div>`;

  let summary = `<div class="psummary">`;
  if (p.brand && p.brand.name) summary += `<div class="kr2">${esc(p.brand.name)}</div>`;
  summary += `<h1 class="ptitle">${esc(p.name)}</h1>`;
  const tags = [];
  (p.audiences || []).forEach((a) => tags.push(`<span class="tag2 aud">${esc(a.name)}</span>`));
  (p.directions || []).forEach((d) => tags.push(`<span class="tag2">${esc(d.name)}</span>`));
  if (tags.length) summary += `<div class="dr-tags">${tags.join("")}</div>`;
  if (p.short_description) summary += `<p class="plede">${esc(p.short_description)}</p>`;

  // идентификация
  const idRows = [];
  if (p.manufacturer_sku) idRows.push(["Артикул", `<span class="mono">${esc(p.manufacturer_sku)}</span>`]);
  if (p.gtin) idRows.push(["Штрих-код (GTIN)", `<span class="mono">${esc(p.gtin)}</span>`]);
  if (p.tnved_code) idRows.push(["Код ТН ВЭД", `<span class="mono">${esc(p.tnved_code)}</span>`]);
  if (p.country_of_origin) idRows.push(["Страна", flag(p.country_of_origin.code) + " " + esc(p.country_of_origin.name)]);
  if (p.category && p.category.name) idRows.push(["Категория", esc(p.category.name)]);
  if (idRows.length) {
    summary += `<dl class="dl">` + idRows.map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join("") + `</dl>`;
  }
  summary += `</div>`;

  let sections = "";

  // варианты серии — ссылки на другие страницы товаров
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

  if (general.length) {
    sections += `<div class="section"><h3>Общие характеристики</h3>` +
      general.map((c) => `<div class="spec"><span class="k">${esc(c.name)}</span><span class="v">${specValue(c)}</span></div>`).join("") +
      `</div>`;
  }
  if (cat.length) {
    sections += `<div class="section"><h3>Характеристики категории</h3>` +
      cat.map((c) => `<div class="spec"><span class="k">${esc(c.name)}</span><span class="v">${specValue(c)}</span></div>`).join("") +
      `</div>`;
  }
  if (p.full_description) {
    sections += `<div class="section"><h3>Описание</h3><div class="rich">${p.full_description}</div></div>`;
  }
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
  // документы — плитка ведёт ТИПОМ документа (внутреннее имя не показываем)
  if (p.documents && p.documents.length) {
    sections += `<div class="section"><h3>Документы</h3><div class="doc-grid">` +
      p.documents.map((d) => {
        const sub = [];
        if (d.number) sub.push("№ " + esc(d.number));
        const val = docValidity(d);
        if (val) sub.push(esc(val));
        const title = d.doc_type_display || "Документ";
        return `<a class="doc-tile" href="${esc(d.file)}" target="_blank" rel="noopener">` +
          `<span class="doc-ic">PDF</span>` +
          `<span class="doc-meta">` +
            `<span class="doc-type">${esc(title)}</span>` +
            (sub.length ? `<span class="doc-sub">${sub.join(" · ")}</span>` : "") +
          `</span>` +
          `<span class="doc-dl">скачать</span>` +
        `</a>`;
      }).join("") +
      `</div></div>`;
  }

  const content = `<main class="product-shell">
  <a class="crumb" href="${SITE_BASE}/">← Каталог</a>
  <div class="product-top">
    ${gallery}
    ${summary}
  </div>
  <div class="product-sections">${sections}</div>
</main>`;

  return layout({
    title: `${p.name} — ПрофиСфера`,
    description: p.short_description || stripHtml(p.full_description),
    canonical,
    image: main,
    bodyClass: "page-product",
    content,
  });
}

/* ---------- sitemap / robots ---------- */
function sitemap(urls) {
  const body = urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
function robots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE}/sitemap.xml\n`;
}

/* ---------- сборка ---------- */
async function copyStatic() {
  for (const f of ["index.html", "app.js", "styles.css", "product.css", "logo.svg"]) {
    const src = path.join(ROOT, f);
    if (existsSync(src)) await copyFile(src, path.join(OUT, f));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await copyStatic();

  const list = await fetchAllProducts();
  console.log(`Товаров в каталоге: ${list.length}`);

  const urls = [`${SITE_BASE}/`];
  let built = 0;
  for (const item of list) {
    const slug = item.slug;
    if (!slug) continue;
    const detail = await getJSON(`/api/products/${slug}/`);
    const dir = path.join(OUT, "product", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), productPage(detail), "utf8");
    urls.push(`${SITE_BASE}/product/${slug}/`);
    built++;
  }

  await writeFile(path.join(OUT, "sitemap.xml"), sitemap(urls), "utf8");
  await writeFile(path.join(OUT, "robots.txt"), robots(), "utf8");
  console.log(`Готово: ${built} страниц товаров + sitemap.xml + robots.txt в ${OUT}/`);
}

main().catch((e) => {
  console.error("Сборка упала:", e.message);
  process.exit(1);
});
