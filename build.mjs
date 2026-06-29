#!/usr/bin/env node
/**
 * ПрофиСфера — генератор статической витрины (SSG).
 *
 * Ходит в PIM API и собирает в каталог _site/:
 *   • index.html          — каталог с серверно-отрисованной сеткой товаров (для SEO);
 *   • product/<slug>/      — полноэкранная страница каждого товара;
 *   • brand/<slug>/        — страница производителя с его товарами;
 *   • c/<slug>/            — страница категории (раздела) с её товарами;
 *   • sitemap.xml, robots.txt;
 *   • копии статики (app.js, styles.css, product.css, logo.svg).
 *
 * Конфигурация — через переменные окружения:
 *   API_BASE   (по умолчанию https://profisfera-pim.ru)
 *   SITE_BASE  (по умолчанию https://prigonskiy.github.io/profisfera-shop)
 *   FIXTURES   — папка с JSON-фикстурами для локальной проверки без сети
 *   OUT        — выходная папка (по умолчанию _site)
 */
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const API_BASE = (process.env.API_BASE || "https://profisfera-pim.ru").replace(/\/$/, "");
const SITE_BASE = (process.env.SITE_BASE || "https://prigonskiy.github.io/profisfera-shop").replace(/\/$/, "");
const FIXTURES = process.env.FIXTURES || null;
const OUT = process.env.OUT || "_site";
const ROOT = path.dirname(new URL(import.meta.url).pathname);

/* ---------- слой данных: HTTP или фикстуры ---------- */
function fixtureFile(apiPath) {
  const safe = apiPath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return path.join(FIXTURES, safe + ".json");
}
async function getJSON(apiPath) {
  if (FIXTURES) return JSON.parse(await readFile(fixtureFile(apiPath), "utf8"));
  const r = await fetch(API_BASE + apiPath, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} на ${apiPath}`);
  return r.json();
}
async function fetchList(apiPath) {
  let url = apiPath;
  const items = [];
  while (url) {
    const data = await getJSON(url);
    (data.results || data).forEach((x) => items.push(x));
    url = data.next ? data.next.replace(API_BASE, "") : null;
  }
  return items;
}

/* утилиты вёрстки и рендер тела товара — общий модуль (его же грузит браузер) */
import { esc, stripHtml, mainImage, productMain, crumbs } from "./render-product.js";

/* ---------- общий каркас страницы ---------- */
// --- иконки разделов навигации (по названию верхней категории) ---
const CAT_ICON = {
  "инструменты": "ic-cat-tools.svg",
  "материалы": "ic-cat-materials.svg",
  "оборудование": "ic-cat-equipment.svg",
};
function catIcon(name) {
  const f = CAT_ICON[(name || "").trim().toLowerCase()];
  return f ? `<img class="nav-ic" src="${SITE_BASE}/${f}" alt="" width="20" height="20">` : "";
}

// навигация из верхних категорий дерева (с выпадающими подкатегориями)
let NAV_HTML = "";
function buildMainNav(tree) {
  // Верхняя панель — простые ссылки на верхние категории; вся навигация теперь в кнопке «Каталог».
  return tree.map((root) =>
    `<a class="nav-cat-link" href="${SITE_BASE}/c/${root.slug}/">${esc(root.name)}</a>`
  ).join("");
}

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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${SITE_BASE}/styles.css">
<link rel="stylesheet" href="${SITE_BASE}/product.css">
</head>
<body class="${bodyClass || ""}">
<div class="site-top">
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="${SITE_BASE}/" aria-label="ПрофиСфера — на главную"><img class="logo-img" src="${SITE_BASE}/logo.svg" alt="ПрофиСфера" height="24"></a>
    <div class="search" role="search" aria-label="Поиск (скоро)"><span class="search-ph">Найти по названию или артикулу</span></div>
    <div class="hcontact"><a class="hphone" href="tel:+79313181319">+7 (931) 318-13-19</a><span class="hhours">ПН-ПТ с 10:00 до 20:00</span></div>
    <div class="hactions"><span class="acct" title="Личный кабинет — скоро"><img src="${SITE_BASE}/ic-user.svg" alt="" width="24" height="24"></span><span class="cart" title="Корзина — скоро"><img src="${SITE_BASE}/ic-cart.svg" alt="" width="24" height="24"><span class="cart-t">Корзина</span><b class="cart-badge">1</b></span></div>
  </div>
</header>
<nav class="mainnav">
  <div class="wrap"><div class="mainnav-row">
    <button type="button" class="nav-catalog" aria-expanded="false"><img src="${SITE_BASE}/ic-burger.svg" alt="" width="16" height="12"><span>Каталог</span></button>
    <div class="nav-cats">${NAV_HTML}</div>
    <div class="nav-links"><span class="nav-stub">Программа лояльности</span><span class="nav-stub">О компании</span><span class="nav-stub">Доставка и оплата</span></div>
  </div></div>
</nav>
</div>
${content}
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="f-copy">© Profisfera, 2026</div>
    <div class="f-links"><span class="f-stub">Условия программы лояльности</span><span class="f-stub">Политика обработки персональных данных</span><span class="f-stub">Пользовательское соглашение</span><span class="f-stub">Согласие на обработку файлов cookie</span><span class="f-stub">Согласие на обработку персональных данных</span></div>
    <div class="f-contact"><a href="tel:+79313181319">+7 (931) 318-13-19</a><a href="mailto:info@profisfera.ru">info@profisfera.ru</a></div>
  </div>
</footer>
<script src="${SITE_BASE}/catalog-menu.js" defer></script>
</body>
</html>
`;
}

/* ---------- плитка товара (ссылка) ---------- */
function productTile(p) {
  const ph = p.thumbnail
    ? `<div class="card-img"><img src="${esc(p.thumbnail)}" alt="${esc(p.name)}" loading="lazy"></div>`
    : `<div class="card-img"><span class="noimg">без фото</span></div>`;
  const art = p.manufacturer_sku ? `<div class="card-sku">Артикул: ${esc(p.manufacturer_sku)}</div>` : "";
  const brand = p.brand ? `<div class="card-brand">${esc(p.brand)}</div>` : "";
  return `<a class="card pcard" href="${SITE_BASE}/product/${esc(p.slug)}/">${ph}<div class="card-body">${art}<div class="card-price">Цена по запросу</div><div class="card-name">${esc(p.name)}</div>${brand}<div class="card-delivery"><img src="${SITE_BASE}/ic-delivery.svg" alt="" width="14" height="14"><span>Доставка от 1 дня</span></div></div><span class="btn-cart" title="Корзина — скоро"><img src="${SITE_BASE}/ic-cart-sm.svg" alt="" width="14" height="13"><span>В корзину</span></span></a>`;
}
function grid(products, emptyText) {
  if (!products.length) return `<div class="state"><h3>Товаров пока нет</h3><p>${esc(emptyText || "")}</p></div>`;
  return `<div class="grid">${products.map(productTile).join("")}</div>`;
}

/* ---------- страница товара ---------- */
function productPage(p, categoryTrail) {
  const canonical = `${SITE_BASE}/product/${p.slug}/`;
  const main = mainImage(p);
  const trail = categoryTrail || [];
  const trailJson = JSON.stringify(trail).replace(/</g, "\\u003c");

  // Живая подгрузка: страница тянет свежие данные и перерисовывает тело тем же кодом.
  // Путь категории (CATEGORY_TRAIL) статичен — встроен один раз и передаётся в рендер.
  const hydrate = `<script type="module">
import { productMain } from "${SITE_BASE}/render-product.js";
const CATEGORY_TRAIL = ${trailJson};
fetch(${JSON.stringify(API_BASE)} + "/api/products/${p.slug}/", { headers: { Accept: "application/json" } })
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d) { const m = document.querySelector(".product-shell"); if (m) m.innerHTML = productMain(d, ${JSON.stringify(SITE_BASE)}, CATEGORY_TRAIL); } })
  .catch(() => {});
</script>`;

  const content = `<main class="product-shell">${productMain(p, SITE_BASE, trail)}</main>
${hydrate}`;
  return layout({
    title: `${p.name} — ПрофиСфера`,
    description: p.short_description || stripHtml(p.full_description),
    canonical, image: main, bodyClass: "page-product", content,
  });
}

/* ---------- страница производителя ---------- */
function brandPage(b, products) {
  const canonical = `${SITE_BASE}/brand/${b.slug}/`;
  const logo = b.logo ? `<div class="blogo"><img src="${esc(b.logo)}" alt="${esc(b.name)}"></div>` : "";
  const desc = b.description
    ? `<div class="rich">${b.description}</div>`
    : `<p style="color:var(--muted)">Описание производителя пока не заполнено в PIM.</p>`;
  const bcrumbs = crumbs([
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: "Производители", href: `${SITE_BASE}/#brands` },
    { name: b.name },
  ]);
  const content = `<main class="page-shell">
  ${bcrumbs}
  <div class="brandhead">${logo}<div class="brandinfo"><h1 class="btitle">${esc(b.name)}</h1>${desc}</div></div>
  <div class="main-head"><h2 class="sec-h">Товары производителя</h2><div class="count"><b>${products.length}</b> товаров</div></div>
  ${grid(products, "У этого производителя пока нет товаров в каталоге.")}
</main>`;
  return layout({
    title: `${b.name} — производитель — ПрофиСфера`,
    description: stripHtml(b.description) || `Товары производителя ${b.name} в каталоге ПрофиСфера.`,
    canonical, image: b.logo || null, bodyClass: "page-brand", content,
  });
}

/* ---------- страница категории (раздела) ---------- */
function catNav(nodes, currentSlug, counts, openSet) {
  return nodes.map((n) => {
    const c = counts[n.slug];
    const cnt = c != null ? `<span class="cat-count">${c}</span>` : "";
    const cur = n.slug === currentSlug ? ' class="current" aria-current="page"' : "";
    const hasKids = n.children && n.children.length;
    const open = openSet.has(n.slug);
    const liClass = hasKids ? (open ? "has-kids" : "has-kids collapsed") : "";
    const toggle = hasKids
      ? `<button type="button" class="cat-toggle" aria-label="Развернуть или свернуть"></button>`
      : `<span class="cat-toggle"></span>`;
    const kids = hasKids ? `<ul>${catNav(n.children, currentSlug, counts, openSet)}</ul>` : "";
    return `<li${liClass ? ` class="${liClass}"` : ""}><div class="cat-row">${toggle}<a href="${SITE_BASE}/c/${n.slug}/"${cur}>${esc(n.name)}${cnt}</a></div>${kids}</li>`;
  }).join("");
}

function categoryPage(cat, products, filterData, tree, counts) {
  const canonical = `${SITE_BASE}/c/${cat.slug}/`;
  const gridHtml = products.length
    ? `<div class="grid" id="cat-grid">${products.map(productTile).join("")}</div>`
    : `<div class="state"><h3>Товаров пока нет</h3><p>В этой категории пока нет товаров.</p></div>`;
  const hasFilters =
    (filterData.filters && filterData.filters.length) ||
    (filterData.brands && filterData.brands.length > 1);

  const openSet = new Set((cat.trail || []).map((t) => t.slug));
  const nav = `<nav class="cat-nav" aria-label="Категории">
      <div class="side-title">Каталог</div>
      <ul>${catNav(tree, cat.slug, counts, openSet)}</ul>
    </nav>`;
  const filtersBlock = hasFilters ? `<div class="filters" id="filters"></div>` : "";
  const sidebar = `<aside class="cat-sidebar" id="cat-sidebar">
      <button type="button" class="cat-sidebar-close" aria-label="Закрыть">×</button>
      ${nav}${filtersBlock}
    </aside>`;
  const mobilebar = `<div class="cat-mobilebar">
    <button type="button" class="cat-mtoggle" data-target="cat"><i class="ti"></i>Категории</button>
    ${hasFilters ? `<button type="button" class="cat-mtoggle" data-target="filters">Фильтры</button>` : ""}
  </div>`;
  const filtersJson = hasFilters
    ? `<script type="application/json" id="category-filters-data">${JSON.stringify(filterData).replace(/</g, "\\u003c")}</script>`
    : "";

  const trailItems = [{ name: "Каталог", href: `${SITE_BASE}/` }];
  (cat.trail || []).slice(0, -1).forEach((a) => trailItems.push({ name: a.name, href: `${SITE_BASE}/c/${a.slug}/` }));
  trailItems.push({ name: cat.name });

  const content = `<main class="page-shell">
  ${crumbs(trailItems)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(cat.name)}</h1><div class="count" id="cat-count"><b>${products.length}</b> товаров</div></div><div class="sort-stub" title="Сортировка — скоро"><span>По популярности</span><i class="caret-down"></i></div></div>
  ${mobilebar}
  <div class="cat-layout">
    ${sidebar}
    <div class="cat-products">${gridHtml}</div>
  </div>
  ${filtersJson}
</main>
<script src="${SITE_BASE}/category-nav.js" defer></script>
${hasFilters ? `<script src="${SITE_BASE}/category-filters.js" defer></script>` : ""}`;
    return layout({
    title: `${cat.name} — каталог — ПрофиСфера`,
    description: `Каталог: ${cat.name}. Стоматологические материалы и инструменты ПрофиСфера.`,
    canonical, image: null, bodyClass: "page-category", content,
  });
}

/* ---------- серверный рендер каталога (index.html) ---------- */
async function bakeIndex(products) {
  let html = await readFile(path.join(ROOT, "index.html"), "utf8");
  const tiles = products.map(productTile).join("");
  // вставляем «запечённую» сетку внутрь #grid (app.js перерисует её на лету)
  html = html.replace(
    /<div class="grid" id="grid">\s*<\/div>/,
    `<div class="grid" id="grid">${tiles}</div>`
  );
  // мета-описание для каталога, если его ещё нет
  if (!/name="description"/.test(html)) {
    html = html.replace(
      /<title>[^<]*<\/title>/,
      (m) => m + `\n<meta name="description" content="Каталог стоматологических материалов и инструментов ПрофиСфера: товары, производители, документы.">`
    );
  }
  return html;
}

/* ---------- sitemap / robots ---------- */
const sitemap = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n") + `\n</urlset>\n`;
const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE}/sitemap.xml\n`;

/* ---------- сборка ---------- */
function collectCategories(nodes) {
  const out = [];
  function walk(node, trail) {
    const myTrail = trail.concat([{ name: node.name, slug: node.slug }]);
    const slugs = [node.slug];
    (node.children || []).forEach((ch) => slugs.push(...walk(ch, myTrail)));
    out.push({ id: node.id, name: node.name, slug: node.slug, slugs, trail: myTrail });
    return slugs;
  }
  nodes.forEach((n) => walk(n, []));
  return out;
}
async function copyStatic() {
  for (const f of ["app.js", "styles.css", "product.css", "logo.svg", "render-product.js", "category-filters.js", "category-nav.js", "catalog-menu.js", "ic-user.svg", "ic-cart.svg", "ic-cart-sm.svg", "ic-caret.svg", "ic-burger.svg", "ic-cat-tools.svg", "ic-cat-materials.svg", "ic-cat-equipment.svg", "ic-stock.svg", "ic-delivery.svg", "ic-bonus.svg"]) {
    const src = path.join(ROOT, f);
    if (existsSync(src)) await copyFile(src, path.join(OUT, f));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await copyStatic();
  const urls = [`${SITE_BASE}/`];

  // дерево категорий — заранее: и для крошек товара (путь предков), и для страниц категорий
  const tree = await getJSON("/api/categories/tree/");
  NAV_HTML = buildMainNav(tree);
  const cats = collectCategories(tree);
  const trailBySlug = {};
  cats.forEach((c) => { trailBySlug[c.slug] = c.trail; });

  // товары
  const list = await fetchList("/api/products/");
  const charsBySlug = {}; // slug -> { code: value } (значения характеристик для фильтров)
  let n = 0;
  for (const item of list) {
    if (!item.slug) continue;
    const detail = await getJSON(`/api/products/${item.slug}/`);
    const map = {};
    (detail.characteristics || []).forEach((c) => { map[c.code] = c.value; });
    charsBySlug[item.slug] = map;
    const trail = (detail.category && trailBySlug[detail.category.slug]) || [];
    const dir = path.join(OUT, "product", item.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), productPage(detail, trail), "utf8");
    urls.push(`${SITE_BASE}/product/${item.slug}/`);
    n++;
  }

  // бренды
  const brands = await fetchList("/api/brands/");
  let nb = 0;
  for (const b of brands) {
    if (!b.slug) continue;
    const prods = await fetchList(`/api/products/?brand=${b.id}`);
    const dir = path.join(OUT, "brand", b.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), brandPage(b, prods), "utf8");
    urls.push(`${SITE_BASE}/brand/${b.slug}/`);
    nb++;
  }

  // количество товаров по поддереву каждой категории (счётчики в навигации)
  const countBySlug = {};
  for (const c of cats) countBySlug[c.slug] = list.filter((p) => c.slugs.includes(p.category)).length;
  await writeFile(path.join(OUT, "counts.json"), JSON.stringify(countBySlug), "utf8");
  await writeFile(path.join(OUT, "tree.json"), JSON.stringify(tree), "utf8");

  // категории (разделы) — cats уже собраны выше
  let nc = 0;
  for (const c of cats) {
    if (!c.slug) continue;
    const prods = list.filter((p) => c.slugs.includes(p.category)); // включая товары вложенных категорий
    // конфиг фильтров (с наследованием) + значения товаров только по нужным кодам
    let filters = [];
    try {
      filters = await getJSON(`/api/categories/${c.slug}/filters/`);
    } catch (e) {
      filters = []; // нет конфигурации — страница просто без фильтров
    }
    const codes = filters.map((f) => f.code);
    const brandsSet = new Set();
    const values = {};
    for (const p of prods) {
      const entry = { brand: p.brand || null };
      if (p.brand) brandsSet.add(p.brand);
      const ch = charsBySlug[p.slug] || {};
      for (const code of codes) if (code in ch) entry[code] = ch[code];
      values[p.slug] = entry;
    }
    const filterData = { filters, brands: Array.from(brandsSet).sort(), values };
    const dir = path.join(OUT, "c", c.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), categoryPage(c, prods, filterData, tree, countBySlug), "utf8");
    urls.push(`${SITE_BASE}/c/${c.slug}/`);
    nc++;
  }

  // каталог (index) + sitemap + robots
  await writeFile(path.join(OUT, "index.html"), await bakeIndex(list), "utf8");
  await writeFile(path.join(OUT, "sitemap.xml"), sitemap(urls), "utf8");
  await writeFile(path.join(OUT, "robots.txt"), robots(), "utf8");

  console.log(`Готово: товаров ${n}, брендов ${nb}, категорий ${nc}, всего URL в sitemap ${urls.length}`);
}

main().catch((e) => {
  console.error("Сборка упала:", e.message);
  process.exit(1);
});
