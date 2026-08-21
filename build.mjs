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
import { fileURLToPath } from "node:url";
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
import { esc, stripHtml, mainImage, productMain, productJsonLd, crumbs, fmtPrice } from "./render-product.js";
import { buildCatalogModel, buildMenuData, buildDirectionLookup, resolveHomeDirection, sectionByAudience } from "./catalog-model.mjs";

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
function buildMainNav() {
  // Разделы рядом с «Каталогом» (категории — внутри кнопки «Каталог»).
  // «Кейсы» и «Справочник» — задел на будущее, пока неактивны.
  return `<a class="nav-cat-link" href="${SITE_BASE}/brands/">Бренды</a>` +
    `<a class="nav-cat-link" href="${SITE_BASE}/cases/">Кейсы</a>` +
    `<span class="nav-cat-link nav-soon" title="Скоро">Справочник</span>`;
}

function layout({ title, description, canonical, image, imageAlt, jsonLd, bodyClass, content }) {
  const desc = stripHtml(description).slice(0, 300);
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="ПрофиСфера">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:title" content="${esc(title)}">`,
    desc ? `<meta property="og:description" content="${esc(desc)}">` : "",
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
    image ? `<meta property="og:image:alt" content="${esc(imageAlt || title)}">` : "",
  ].filter(Boolean).join("\n");
  const tw = [
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    desc ? `<meta name="twitter:description" content="${esc(desc)}">` : "",
    image ? `<meta name="twitter:image" content="${esc(image)}">` : "",
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
${tw}
${jsonLd || ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://flagcdn.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${SITE_BASE}/styles.css">
<link rel="stylesheet" href="${SITE_BASE}/product.css">
</head>
<body class="${bodyClass || ""}">
<div class="site-top">
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="${SITE_BASE}/" aria-label="ПрофиСфера — на главную"><img class="logo-img" src="${SITE_BASE}/logo.svg" alt="ПрофиСфера" height="24"></a>
    <form class="search" role="search" action="${SITE_BASE}/search/" method="get" autocomplete="off">
      <svg class="search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4-4"></path></svg>
      <input class="search-input" type="search" name="q" placeholder="Найти по названию или артикулу" aria-label="Поиск по каталогу">
    </form>
    <div class="hcontact"><a class="hphone" href="tel:+79313181319">+7 (931) 318-13-19</a><span class="hhours">ПН-ПТ с 10:00 до 20:00</span></div>
    <div class="hactions"><div class="acct" id="auth-slot" data-api="${API_BASE}"><a class="auth-login" href="#"><img src="${SITE_BASE}/ic-user.svg" alt="" width="24" height="24"><span>Войти</span></a></div><span class="cart" title="Корзина — скоро"><img src="${SITE_BASE}/ic-cart.svg" alt="" width="24" height="24"><span class="cart-t">Корзина</span><b class="cart-badge">1</b></span></div>
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
<script src="${SITE_BASE}/search.js" defer></script>
<script src="${SITE_BASE}/auth.js" defer></script>
<script src="${SITE_BASE}/course.js" defer></script>
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
  return `<a class="card pcard" href="${SITE_BASE}/product/${esc(p.slug)}/">${ph}<div class="card-body">${art}<div class="card-price">${p.price_from ? "от " + fmtPrice(p.price_from) : "Цена по запросу"}</div><div class="card-name">${esc(p.name)}</div>${brand}<div class="card-delivery"><img src="${SITE_BASE}/ic-delivery.svg" alt="" width="14" height="14"><span>Доставка от 1 дня</span></div></div><span class="btn-cart" title="Корзина — скоро"><img src="${SITE_BASE}/ic-cart-sm.svg" alt="" width="14" height="13"><span>В корзину</span></span></a>`;
}
function grid(products, emptyText) {
  if (!products.length) return `<div class="state"><h3>Товаров пока нет</h3><p>${esc(emptyText || "")}</p></div>`;
  return `<div class="grid">${products.map(productTile).join("")}</div>`;
}

/* ---------- страница результатов поиска ---------- */
function searchPage() {
  const content = `<main class="wrap search-page">
  <h1 class="search-h">Поиск</h1>
  <p class="search-sub" id="search-count">Введите запрос в строке поиска выше.</p>
  <div class="grid" id="search-results"></div>
</main>`;
  return layout({
    title: "Поиск — ПрофиСфера",
    description: "Поиск по каталогу стоматологических материалов и инструментов ПрофиСфера.",
    canonical: `${SITE_BASE}/search/`,
    content,
  });
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
const API = ${JSON.stringify(API_BASE)};
const SITE = ${JSON.stringify(SITE_BASE)};
const SLUG = ${JSON.stringify(p.slug)};
async function renderProduct() {
  let d = null;
  try { const r = await fetch(API + "/api/products/" + SLUG + "/", { headers: { Accept: "application/json" } }); d = r.ok ? await r.json() : null; } catch (e) {}
  if (!d) return;
  const auth = window.ProfiAuth;
  if (auth && auth.token) {
    try {
      const pr = await fetch(API + "/api/products/" + SLUG + "/pricing/", { headers: { Accept: "application/json", Authorization: "Bearer " + auth.token } });
      if (pr.ok) { const pd = await pr.json(); d.offers = pd.offers; d.price_from = pd.price_from; }
    } catch (e) {}
  }
  const role = (auth && auth.activeRole) || null;
  const m = document.querySelector(".product-shell");
  if (m) m.innerHTML = productMain(d, SITE, CATEGORY_TRAIL, role);
}
renderProduct();
window.addEventListener("profi:auth", renderProduct);
window.addEventListener("profi:role", renderProduct);

// Галерея товара: свап превью и просмотр оригинала. Делегируем на document —
// переживает перерисовку .product-shell при гидрате/смене роли.
function openOriginal(src) {
  if (!src) return;
  var lb = document.createElement("div");
  lb.className = "imglb";
  var img = document.createElement("img");
  img.src = src; img.alt = "";
  lb.appendChild(img);
  function close() { lb.remove(); document.removeEventListener("keydown", onKey); }
  function onKey(ev) { if (ev.key === "Escape") close(); }
  lb.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(lb);
}
document.addEventListener("click", function (e) {
  var th = e.target.closest && e.target.closest(".pthumb");
  if (th) {
    var g = th.closest(".pgallery"); if (!g) return;
    var pm = g.querySelector(".pmain"), img = pm && pm.querySelector("img");
    if (img && th.dataset.main) img.src = th.dataset.main;
    if (pm) {
      if (th.dataset.original) { pm.dataset.original = th.dataset.original; pm.classList.add("pmain--zoom"); }
      else { delete pm.dataset.original; pm.classList.remove("pmain--zoom"); }
    }
    g.querySelectorAll(".pthumb").forEach(function (t) { t.classList.remove("active"); });
    th.classList.add("active");
    return;
  }
  var zoom = e.target.closest && e.target.closest(".pmain--zoom");
  if (zoom && zoom.dataset.original) openOriginal(zoom.dataset.original);
});
</script>`;

  const content = `<main class="product-shell">${productMain(p, SITE_BASE, trail)}</main>
${hydrate}`;
  return layout({
    title: `${p.name} — ПрофиСфера`,
    description: p.short_description || stripHtml(p.full_description),
    canonical, image: main, imageAlt: p.name,
    jsonLd: productJsonLd(p, SITE_BASE, trail),
    bodyClass: "page-product", content,
  });
}

/* ---------- страница производителя ---------- */
function brandPage(b, products, pruned, brandCounts) {
  const canonical = `${SITE_BASE}/brand/${b.slug}/`;
  const logo = b.logo ? `<div class="blogo"><img src="${esc(b.logo)}" alt="${esc(b.name)}"></div>` : "";
  const desc = b.description
    ? `<div class="rich">${b.description}</div>`
    : `<p style="color:var(--muted)">Описание производителя пока не заполнено в PIM.</p>`;
  const bcrumbs = crumbs([
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: "Бренды", href: `${SITE_BASE}/brands/` },
    { name: b.name },
  ]);
  const gridHtml = grid(products, "У этого производителя пока нет товаров в каталоге.");
  const hasTree = pruned && pruned.length;
  const body = hasTree
    ? `<div class="cat-mobilebar"><button type="button" class="cat-mtoggle" data-target="cat"><i class="ti"></i>Категории</button></div>
  <div class="cat-layout">
    <aside class="cat-sidebar" id="cat-sidebar">
      <button type="button" class="cat-sidebar-close" aria-label="Закрыть">×</button>
      ${brandTreeNav(pruned, null, brandCounts, b.slug)}
    </aside>
    <div class="cat-products">${gridHtml}</div>
  </div>`
    : gridHtml;
  const content = `<main class="page-shell">
  ${bcrumbs}
  <div class="brandhead">${logo}<div class="brandinfo"><h1 class="btitle">${esc(b.name)}</h1>${desc}</div></div>
  <div class="main-head"><h2 class="sec-h">Товары производителя</h2><div class="count"><b>${products.length}</b> товаров</div></div>
  ${body}
</main>
${hasTree ? `<script src="${SITE_BASE}/category-nav.js" defer></script>` : ""}`;
  return layout({
    title: `${b.name} — производитель — ПрофиСфера`,
    description: stripHtml(b.description) || `Товары производителя ${b.name} в каталоге ПрофиСфера.`,
    canonical, image: b.logo || null, bodyClass: "page-brand", content,
  });
}

/* ---------- страница «бренд × категория» ---------- */
function brandCategoryPage(b, cat, products, filterData, pruned, brandCounts) {
  const canonical = `${SITE_BASE}/brand/${b.slug}/${cat.slug}/`;
  const gridHtml = products.length
    ? `<div class="grid" id="cat-grid">${products.map(productTile).join("")}</div>`
    : `<div class="state"><h3>Товаров пока нет</h3><p>У бренда нет товаров в этой категории.</p></div>`;
  const hasFilters =
    (filterData.filters && filterData.filters.length) ||
    (filterData.brands && filterData.brands.length > 1);
  const filtersBlock = hasFilters ? `<div class="filters" id="filters"></div>` : "";
  const sidebar = `<aside class="cat-sidebar" id="cat-sidebar">
      <button type="button" class="cat-sidebar-close" aria-label="Закрыть">×</button>
      ${brandTreeNav(pruned, cat.slug, brandCounts, b.slug)}${filtersBlock}
    </aside>`;
  const mobilebar = `<div class="cat-mobilebar">
    <button type="button" class="cat-mtoggle" data-target="cat"><i class="ti"></i>Категории</button>
    ${hasFilters ? `<button type="button" class="cat-mtoggle" data-target="filters">Фильтры</button>` : ""}
  </div>`;
  const filtersJson = hasFilters
    ? `<script type="application/json" id="category-filters-data">${JSON.stringify(filterData).replace(/</g, "\\u003c")}</script>`
    : "";
  const trailItems = [
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: "Бренды", href: `${SITE_BASE}/brands/` },
    { name: b.name, href: `${SITE_BASE}/brand/${b.slug}/` },
    { name: cat.name },
  ];
  const content = `<main class="page-shell">
  ${crumbs(trailItems)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(b.name)}: ${esc(cat.name)}</h1><div class="count" id="cat-count"><b>${products.length}</b> товаров</div></div><div class="sort-stub" title="Сортировка — скоро"><span>По популярности</span><i class="caret-down"></i></div></div>
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
    title: `${b.name}: ${cat.name} — ПрофиСфера`,
    description: `Товары производителя ${b.name} в категории «${cat.name}» — каталог ПрофиСфера.`,
    canonical, bodyClass: "page-brand-cat", content,
  });
}

/* ---------- страница списка брендов ---------- */
function brandTile(b) {
  const ph = b.logo
    ? `<div class="ph"><img src="${esc(b.logo)}" alt="${esc(b.name)}" loading="lazy"></div>`
    : `<div class="ph"><div class="noimg">${esc(b.name)}</div></div>`;
  const ds = stripHtml(b.description || "");
  const dsHtml = ds ? `<div class="ds">${esc(ds)}</div>` : "";
  return `<a class="card brandcard" href="${SITE_BASE}/brand/${esc(b.slug)}/">${ph}<div class="body"><div class="nm">${esc(b.name)}</div>${dsHtml}</div></a>`;
}
function brandsPage(brands) {
  const cards = brands.filter((b) => b.slug).map(brandTile).join("");
  const content = `<main class="page-shell">
  ${crumbs([{ name: "Каталог", href: `${SITE_BASE}/` }, { name: "Бренды" }])}
  <div class="main-head"><h1 class="sec-h">Бренды</h1><div class="count"><b>${brands.length}</b> производителей</div></div>
  ${cards ? `<div class="grid">${cards}</div>` : `<div class="state"><h3>Производителей пока нет</h3><p>Добавьте бренды в PIM.</p></div>`}
</main>`;
  return layout({
    title: "Бренды — ПрофиСфера",
    description: "Производители стоматологических материалов и инструментов, представленные на ПрофиСфере.",
    canonical: `${SITE_BASE}/brands/`,
    bodyClass: "page-brands", content,
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

// подрезка дерева до веток, где есть товары бренда (keep — слаги таких категорий и их предков)
function pruneTree(nodes, keep) {
  const out = [];
  for (const n of nodes || []) {
    const kids = pruneTree(n.children || [], keep);
    if (keep.has(n.slug) || kids.length) out.push({ ...n, children: kids });
  }
  return out;
}
// полное дерево категорий бренда (все вложенности), ссылки на /brand/<slug>/<cat>/
function brandCatNav(nodes, currentSlug, counts, brandSlug) {
  return nodes.map((n) => {
    const c = counts[n.slug];
    const cnt = c != null ? `<span class="cat-count">${c}</span>` : "";
    const cur = n.slug === currentSlug ? ' class="current" aria-current="page"' : "";
    const hasKids = n.children && n.children.length;
    const toggle = hasKids
      ? `<button type="button" class="cat-toggle" aria-label="Развернуть или свернуть"></button>`
      : `<span class="cat-toggle"></span>`;
    const kids = hasKids ? `<ul>${brandCatNav(n.children, currentSlug, counts, brandSlug)}</ul>` : "";
    return `<li${hasKids ? ` class="has-kids"` : ""}><div class="cat-row">${toggle}<a href="${SITE_BASE}/brand/${brandSlug}/${n.slug}/"${cur}>${esc(n.name)}${cnt}</a></div>${kids}</li>`;
  }).join("");
}
function brandTreeNav(pruned, currentSlug, counts, brandSlug) {
  const up = currentSlug
    ? `<a class="cn-up" href="${SITE_BASE}/brand/${brandSlug}/">\u2190 Все товары бренда</a>`
    : "";
  return `<nav class="cat-nav" aria-label="Категории бренда">
      <div class="side-title">Категории</div>
      ${up}
      <ul class="cat-tree">${brandCatNav(pruned, currentSlug, counts, brandSlug)}</ul>
    </nav>`;
}

function findNode(nodes, slug) {
  for (const n of nodes || []) {
    if (n.slug === slug) return n;
    const f = findNode(n.children, slug);
    if (f) return f;
  }
  return null;
}
// Сжатая навигация по категории: ↑ на уровень выше, текущая категория и её подкатегории
// (для листа без детей — показываем соседей: подкатегории родителя, текущая подсвечена).
function catNavCompact(cat, tree, counts) {
  const trail = cat.trail || [];
  const current = findNode(tree, cat.slug) || { slug: cat.slug, name: cat.name, children: [] };
  const hasKids = current.children && current.children.length;
  let focusNode, focusIdx;
  if (hasKids) { focusNode = current; focusIdx = trail.length - 1; }
  else if (trail.length >= 2) { focusNode = findNode(tree, trail[trail.length - 2].slug); focusIdx = trail.length - 2; }
  else { focusNode = current; focusIdx = trail.length - 1; }
  focusNode = focusNode || current;
  const up = focusIdx - 1 >= 0 ? trail[focusIdx - 1] : null;
  const upHtml = up
    ? `<a class="cn-up" href="${SITE_BASE}/c/${up.slug}/">\u2190 ${esc(up.name)}</a>`
    : `<a class="cn-up" href="${SITE_BASE}/">\u2190 Все категории</a>`;
  const link = (n) => {
    const c = counts[n.slug];
    const cnt = c != null ? `<span class="cat-count">${c}</span>` : "";
    const cur = n.slug === cat.slug ? ' class="current" aria-current="page"' : "";
    return `<a href="${SITE_BASE}/c/${n.slug}/"${cur}>${esc(n.name)}${cnt}</a>`;
  };
  const items = (focusNode.children || []).map((ch) => `<li>${link(ch)}</li>`).join("");
  const list = items ? `<ul class="cn-list">${items}</ul>` : "";
  return `<nav class="cat-nav" aria-label="Категория">
      <div class="side-title">Категория</div>
      ${upHtml}
      <div class="cn-head">${link(focusNode)}</div>
      ${list}
    </nav>`;
}

function categoryPage(cat, products, filterData, tree, counts) {
  const canonical = `${SITE_BASE}/c/${cat.slug}/`;
  const gridHtml = products.length
    ? `<div class="grid" id="cat-grid">${products.map(productTile).join("")}</div>`
    : `<div class="state"><h3>Товаров пока нет</h3><p>В этой категории пока нет товаров.</p></div>`;
  const hasFilters =
    (filterData.filters && filterData.filters.length) ||
    (filterData.brands && filterData.brands.length > 1);

  const nav = catNavCompact(cat, tree, counts);
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

/* ---------- внешний каталог: направления и контекстные срезы ---------- */
const DIR_PREVIEW = 8; // сколько плиток показывать в группе на странице направления

/** Куда ведёт листовая группа с страницы направления и генерить ли срез.
 *  Толстая (>= minSlice) → свой срез. Тонкая → по thin_slice_mode:
 *  link_to_canonical → на каноническую категорию, hide → не показывать. */
function groupTarget(section, dir, g, minSlice, thinMode) {
  const thick = g.products.length >= minSlice;
  if (thick) return { url: `${SITE_BASE}/${section.slug}/${dir.slug}/${g.catSlug}/`, slice: true, show: true };
  if (thinMode === "hide") return { url: null, slice: false, show: false };
  return { url: `${SITE_BASE}/c/${g.catSlug}/`, slice: false, show: true }; // link_to_canonical
}

/** Блок одной листовой категории на странице направления/группы: заголовок-ссылка
 *  (на срез или канон) + превью плиток + «Все N →». */
function leafBlock(section, dir, g, minSlice, thinMode) {
  const t = groupTarget(section, dir, g, minSlice, thinMode);
  if (!t.show) return "";
  const head = t.url
    ? `<h3 class="dir-group-title"><a href="${t.url}">${esc(g.catName)}</a></h3>`
    : `<h3 class="dir-group-title">${esc(g.catName)}</h3>`;
  const preview = g.products.slice(0, DIR_PREVIEW);
  const more = (t.url && g.products.length > preview.length)
    ? `<a class="dir-group-all" href="${t.url}">Все ${g.products.length} \u2192</a>`
    : "";
  return `<section class="dir-group">
      <div class="dir-group-head">${head}<span class="dir-group-count">${g.products.length}</span></div>
      <div class="grid">${preview.map(productTile).join("")}</div>
      ${more}
    </section>`;
}

export function directionPage(section, dir, minSlice, thinMode) {
  const trail = [
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: section.title, href: `${SITE_BASE}/${section.slug}/` },
    { name: dir.title },
  ];
  const leaf = (g) => leafBlock(section, dir, g, minSlice, thinMode);
  const pres = dir.presentation || { groups: [], tail: dir.leaves };
  let body;
  if (pres.groups.length) {
    // презентационные группы (напр. «Реставрация») + хвост негруппированных
    body = pres.groups.map((gr) =>
      `<section class="dir-supergroup">
      <div class="dir-supergroup-head"><h2 class="dir-supergroup-title"><a href="${SITE_BASE}${gr.url}">${esc(gr.title)}</a></h2><span class="dir-supergroup-count">${gr.total}</span></div>
      ${gr.leaves.map(leaf).join("")}
    </section>`
    ).join("");
    if (pres.tail.length) {
      body += `<section class="dir-supergroup">
      <div class="dir-supergroup-head"><h2 class="dir-supergroup-title">Ещё в «${esc(dir.title)}»</h2></div>
      ${pres.tail.map(leaf).join("")}
    </section>`;
    }
  } else {
    body = dir.leaves.map(leaf).join("");
  }

  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(dir.title)}</h1><div class="count"><b>${dir.total}</b> товаров</div></div></div>
  ${dir.seoIntro ? `<p class="dir-intro">${esc(dir.seoIntro)}</p>` : ""}
  ${body || `<div class="state"><h3>Товаров пока нет</h3></div>`}
</main>`;
  return layout({
    title: `${dir.seoTitle || dir.title} — ПрофиСфера`,
    description: `${dir.seoTitle || dir.title}. Каталог ПрофиСфера.`,
    canonical: `${SITE_BASE}/${section.slug}/${dir.slug}/`,
    image: null, bodyClass: "page-direction", content,
  });
}

/** Страница презентационной группы «направление × категории группы» (напр. «Реставрация»
 *  в терапии). Показывает листовые категории группы, каждую — блоком с превью. */
export function directionGroupPage(section, dir, grp, minSlice, thinMode) {
  const trail = [
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: section.title, href: `${SITE_BASE}/${section.slug}/` },
    { name: dir.title, href: `${SITE_BASE}/${section.slug}/${dir.slug}/` },
    { name: grp.title },
  ];
  const body = grp.leaves.map((g) => leafBlock(section, dir, g, minSlice, thinMode)).join("");
  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(grp.title)}</h1><div class="count"><b>${grp.total}</b> товаров</div></div></div>
  <p class="ctx-banner">Раздел «${esc(dir.title)}» — подборка «${esc(grp.title)}».</p>
  ${body || `<div class="state"><h3>Товаров пока нет</h3></div>`}
</main>`;
  return layout({
    title: `${grp.seoTitle || grp.title} — ${dir.title} — ПрофиСфера`,
    description: `${grp.seoTitle || grp.title}. ${dir.title}, каталог ПрофиСфера.`,
    canonical: `${SITE_BASE}${grp.url}`,
    image: null, bodyClass: "page-direction page-group", content,
  });
}

/** Сайдбар среза: соседние листовые категории этого направления (контекст-навигация). */
function directionCatNav(section, dir, currentCatSlug, minSlice, thinMode) {
  const items = dir.leaves.map((g) => {
    const t = groupTarget(section, dir, g, minSlice, thinMode);
    if (!t.show) return "";
    const cur = g.catSlug === currentCatSlug ? ' class="current" aria-current="page"' : "";
    const href = t.url || `${SITE_BASE}/c/${g.catSlug}/`;
    return `<li><a href="${href}"${cur}>${esc(g.catName)}<span class="cat-count">${g.products.length}</span></a></li>`;
  }).join("");
  return `<nav class="cat-nav" aria-label="Категории направления">
      <div class="side-title">${esc(dir.title)}</div>
      <a class="cn-up" href="${SITE_BASE}/${section.slug}/${dir.slug}/">\u2190 Все категории направления</a>
      <ul class="cn-list">${items}</ul>
    </nav>`;
}

/** Контекстный срез «направление × листовая категория». fullCount — товаров в
 *  полной категории (весь каталог). Если срез == полная категория → canonical на
 *  каноническую страницу и без баннера. */
export function directionCategoryPage(section, dir, group, fullCount, filterData, minSlice, thinMode) {
  const products = group.products;
  const canonSame = products.length >= fullCount; // срез покрывает всю категорию
  const ownUrl = `${SITE_BASE}/${section.slug}/${dir.slug}/${group.catSlug}/`;
  const canonUrl = canonSame ? `${SITE_BASE}/c/${group.catSlug}/` : ownUrl;

  const banner = canonSame ? "" :
    `<div class="ctx-banner">Показаны товары для направления «${esc(dir.title)}» — <b>${products.length}</b> из ${fullCount} в категории. <a href="${SITE_BASE}/c/${group.catSlug}/">Показать все «${esc(group.catName)}» (${fullCount})</a></div>`;

  const gridHtml = products.length
    ? `<div class="grid" id="cat-grid">${products.map(productTile).join("")}</div>`
    : `<div class="state"><h3>Товаров пока нет</h3></div>`;
  const hasFilters = (filterData.filters && filterData.filters.length) || (filterData.brands && filterData.brands.length > 1);
  const nav = directionCatNav(section, dir, group.catSlug, minSlice, thinMode);
  const filtersBlock = hasFilters ? `<div class="filters" id="filters"></div>` : "";
  const sidebar = `<aside class="cat-sidebar" id="cat-sidebar">
      <button type="button" class="cat-sidebar-close" aria-label="Закрыть">×</button>
      ${nav}${filtersBlock}
    </aside>`;
  const mobilebar = `<div class="cat-mobilebar">
    <button type="button" class="cat-mtoggle" data-target="cat">Категории</button>
    ${hasFilters ? `<button type="button" class="cat-mtoggle" data-target="filters">Фильтры</button>` : ""}
  </div>`;
  const filtersJson = hasFilters
    ? `<script type="application/json" id="category-filters-data">${JSON.stringify(filterData).replace(/</g, "\\u003c")}</script>`
    : "";

  const trail = [
    { name: "Каталог", href: `${SITE_BASE}/` },
    { name: section.title, href: `${SITE_BASE}/${section.slug}/` },
    { name: dir.title, href: `${SITE_BASE}/${section.slug}/${dir.slug}/` },
    { name: group.catName },
  ];
  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(group.catName)}</h1><div class="count" id="cat-count"><b>${products.length}</b> товаров</div></div><div class="sort-stub" title="Сортировка — скоро"><span>По популярности</span><i class="caret-down"></i></div></div>
  ${banner}
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
    title: canonSame ? `${group.catName} — ПрофиСфера` : `${group.catName} — ${dir.title} — ПрофиСфера`,
    description: `${group.catName}: ${dir.seoTitle || dir.title}. Каталог ПрофиСфера.`,
    canonical: canonUrl, image: null, bodyClass: "page-category page-slice", content,
  });
}

export function sectionPage(section, minSlice, thinMode) {
  const trail = [{ name: "Каталог", href: `${SITE_BASE}/` }, { name: section.title }];
  let body;
  if (section.directions.length) {
    body = `<div class="dir-cards">` + section.directions.map((d) =>
      `<a class="dir-card" href="${SITE_BASE}/${section.slug}/${d.slug}/"><span class="dir-card-title">${esc(d.title)}</span><span class="dir-card-count">${d.total} товаров</span></a>`
    ).join("") + `</div>`;
  } else {
    // без направлений (общая медицина / пациент): листовые группы → каноническая категория
    body = (section.audienceGroups || []).map((g) =>
      `<section class="dir-group"><div class="dir-group-head"><h2 class="dir-group-title"><a href="${SITE_BASE}/c/${g.catSlug}/">${esc(g.catName)}</a></h2><span class="dir-group-count">${g.products.length}</span></div><div class="grid">${g.products.slice(0, DIR_PREVIEW).map(productTile).join("")}</div>${g.products.length > DIR_PREVIEW ? `<a class="dir-group-all" href="${SITE_BASE}/c/${g.catSlug}/">Все ${g.products.length} \u2192</a>` : ""}</section>`
    ).join("");
  }
  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(section.title)}</h1><div class="count"><b>${section.total}</b> товаров</div></div></div>
  ${body || `<div class="state"><h3>Товаров пока нет</h3></div>`}
</main>`;
  return layout({
    title: `${section.title} — ПрофиСфера`,
    description: `${section.title}. Каталог ПрофиСфера.`,
    canonical: `${SITE_BASE}/${section.slug}/`, image: null, bodyClass: "page-section", content,
  });
}

/* ---------- раздел «Кейсы» ---------- */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const CASE_PROFILE = { clinical: "Клинический", lab: "Зуботехнический", joint: "Клинический + лабораторный" };
const CASE_PROFILE_SHORT = { clinical: "Клинический", lab: "Зуботехнический", joint: "Смешанный" };

export function caseTile(c, dirName) {
  const cover = c.cover && c.cover.thumb
    ? `<img src="${esc(c.cover.thumb)}" alt="${esc((c.cover && c.cover.alt) || c.title || "")}" loading="lazy">`
    : `<span class="noimg">без обложки</span>`;
  const prof = CASE_PROFILE_SHORT[c.case_profile]
    ? `<span class="case-badge case-badge--${esc(c.case_profile)}">${CASE_PROFILE_SHORT[c.case_profile]}</span>` : "";
  const dirs = (c.directions || []).map((d) => `<span class="case-dir">${esc(dirName ? dirName(d) : d)}</span>`).join("");
  const num = c.case_number ? `<div class="case-num">Кейс №${esc(c.case_number)}</div>` : "";
  const dataDirs = (c.directions || []).join(" ");
  return `<a class="case-card" href="${SITE_BASE}/cases/${esc(c.slug)}/" data-dirs="${esc(dataDirs)}" data-profile="${esc(c.case_profile || "")}">
    <div class="case-cover">${cover}${prof}</div>
    <div class="case-body">${num}<h3 class="case-title">${esc(c.title || "")}</h3>${dirs ? `<div class="case-dirs">${dirs}</div>` : ""}</div>
  </a>`;
}

function caseGrid(cases, dirName, emptyText) {
  if (!cases.length) return `<div class="state"><h3>Кейсов пока нет</h3><p>${esc(emptyText || "")}</p></div>`;
  return `<div class="cases-grid">${cases.map((c) => caseTile(c, dirName)).join("")}</div>`;
}

export function casesRootPage(rootCases, subsections, dirName) {
  const trail = [{ name: "Главная", href: `${SITE_BASE}/` }, { name: "Кейсы" }];
  const subCards = subsections
    .filter((s) => s.count > 0)
    .map((s) => `<a class="case-subcard" href="${SITE_BASE}/cases/${s.slug}/"><span class="case-subcard-t">${esc(s.title)}</span><span class="case-subcard-c">${s.count} ${plural(s.count, "кейс", "кейса", "кейсов")}</span></a>`)
    .join("");
  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>Клинические и зуботехнические кейсы</h1></div></div>
  ${subCards ? `<div class="case-subcards">${subCards}</div>` : ""}
  ${caseGrid(rootCases, dirName, "Скоро здесь появятся разборы клинических и лабораторных случаев.")}
</main>`;
  return layout({
    title: "Кейсы — клинические и зуботехнические разборы — ПрофиСфера",
    description: "Клинические и зуботехнические кейсы: разбор случаев, применённые материалы и инструменты.",
    canonical: `${SITE_BASE}/cases/`, image: null, bodyClass: "page-cases", content,
  });
}

export function casesSubPage(title, slug, cases, dirName) {
  const trail = [{ name: "Главная", href: `${SITE_BASE}/` }, { name: "Кейсы", href: `${SITE_BASE}/cases/` }, { name: title }];
  // фильтры: собираем встречающиеся направления и профили (union по кейсам подраздела)
  const dirSet = [], dSeen = new Set();
  cases.forEach((c) => (c.directions || []).forEach((d) => { if (!dSeen.has(d)) { dSeen.add(d); dirSet.push(d); } }));
  const profSet = [], pSeen = new Set();
  cases.forEach((c) => { const pr = c.case_profile; if (pr && !pSeen.has(pr)) { pSeen.add(pr); profSet.push(pr); } });
  const chip = (group, val, label) => `<button type="button" class="case-fchip" data-group="${group}" data-val="${esc(val)}">${esc(label)}</button>`;
  const dirGroup = dirSet.length >= 1
    ? `<div class="case-fgroup"><span class="case-flabel">Направление</span><div class="case-fchips">${dirSet.map((d) => chip("dir", d, dirName ? dirName(d) : d)).join("")}</div></div>` : "";
  const profGroup = profSet.length >= 1
    ? `<div class="case-fgroup"><span class="case-flabel">Профиль</span><div class="case-fchips">${profSet.map((p) => chip("profile", p, CASE_PROFILE[p] || p)).join("")}</div></div>` : "";
  const filterBar = (cases.length >= 2 && (dirGroup || profGroup)) ? `<div class="case-filters" data-total="${cases.length}">${dirGroup}${profGroup}</div>` : "";

  const content = `<main class="page-shell">
  ${crumbs(trail)}
  <div class="main-head"><div class="main-head-l"><h1>${esc(title)}</h1><div class="count" id="case-count"><b>${cases.length}</b> ${plural(cases.length, "кейс", "кейса", "кейсов")}</div></div></div>
  ${filterBar}
  ${caseGrid(cases, dirName)}
</main>${filterBar ? `\n<script src="${SITE_BASE}/case-filter.js" defer></script>` : ""}`;
  return layout({
    title: `${title} — ПрофиСфера`,
    description: `${title}: разбор случаев с применёнными материалами и инструментами.`,
    canonical: `${SITE_BASE}/cases/${slug}/`, image: null, bodyClass: "page-cases", content,
  });
}

/* ---------- страница кейса ---------- */
const FDI_UPPER = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
const FDI_LOWER = ["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"];
const FDI_UPPER_P = ["55","54","53","52","51","61","62","63","64","65"];
const FDI_LOWER_P = ["85","84","83","82","81","71","72","73","74","75"];
const CASE_DENTITION = { permanent: "постоянные", primary: "молочные", mixed: "смешанный прикус" };
const CASE_ARCH = { upper: "верхняя", lower: "нижняя" };
const CASE_GROUP = { molars: "моляры", premolars: "премоляры", canines: "клыки", incisors: "резцы" };
const CASE_SIDE = { right: "справа", left: "слева" };

function ruDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}
const fdiDot = (t) => (String(t).length === 2 ? `${String(t)[0]}.${String(t)[1]}` : String(t));

// предикат «зуб подсвечен» по scope (фасеты посчитаны PIM)
function caseToothIsOn(c) {
  const scope = c.tooth_scope;
  const teeth = new Set((c.teeth || []).map(String));
  const arches = c.arches || [];
  const upperSet = new Set(FDI_UPPER.concat(FDI_UPPER_P));
  return function (fdi) {
    if (scope === "full_mouth") return true;
    if (scope === "arch") {
      const up = upperSet.has(fdi);
      return (up && arches.indexOf("upper") >= 0) || (!up && arches.indexOf("lower") >= 0);
    }
    return teeth.has(String(fdi));
  };
}

function caseToothSummary(c) {
  const parts = [];
  (c.dentition || []).forEach((d) => parts.push(CASE_DENTITION[d] || d));
  (c.arches || []).forEach((a) => parts.push(CASE_ARCH[a] || a));
  (c.tooth_groups || []).forEach((g) => parts.push(CASE_GROUP[g] || g));
  (c.tooth_sides || []).forEach((s) => parts.push(CASE_SIDE[s] || s));
  return parts.join(" · ");
}

// одна сетка зубов (верх + низ) с подсветкой по isOn
function toothGrid(upperArr, lowerArr, isOn, label) {
  const W = 28, H = 32, GAP = 3, MID = 12, Y0 = 8, Y1 = 8 + H + 12;
  const half = upperArr.length / 2;
  const xOf = (i) => i * (W + GAP) + (i >= half ? MID : 0);
  const cell = (fdi, x, y) => {
    const on = isOn(fdi);
    return `<g><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="${on ? "#1462FF" : "#fff"}" stroke="${on ? "#1462FF" : "#E6EAF0"}"></rect>` +
      `<text x="${x + W / 2}" y="${y + H / 2 + 4}" text-anchor="middle" font-size="10.5" font-weight="${on ? 700 : 500}" fill="${on ? "#fff" : "#8A94A6"}">${fdiDot(fdi)}</text></g>`;
  };
  const upper = upperArr.map((t, i) => cell(t, xOf(i), Y0)).join("");
  const lower = lowerArr.map((t, i) => cell(t, xOf(i), Y1)).join("");
  const midX = xOf(half) - MID / 2 - GAP / 2;
  const totalW = xOf(upperArr.length - 1) + W;
  const totalH = Y1 + H + 6;
  return `<div class="tooth-grid">${label ? `<div class="tooth-grid-label">${esc(label)}</div>` : ""}` +
    `<svg class="tooth-svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-label="${esc((label ? label + ": " : "") + "зубная формула")}" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="${midX}" y1="2" x2="${midX}" y2="${totalH - 2}" stroke="#D5DCE6" stroke-width="1" stroke-dasharray="3 3"></line>${upper}${lower}</svg></div>`;
}

export function caseToothCard(c) {
  const scope = c.tooth_scope;
  const teeth = (c.teeth || []).map(String);
  if (!(teeth.length || scope === "arch" || scope === "full_mouth")) return "";
  const dents = c.dentition || [];
  let showPerm = dents.indexOf("permanent") >= 0 || dents.indexOf("mixed") >= 0;
  let showPrim = dents.indexOf("primary") >= 0 || dents.indexOf("mixed") >= 0;
  if (!showPerm && !showPrim) {
    showPrim = teeth.some((t) => /^[5-8]/.test(t)); // молочные FDI начинаются с 5-8
    showPerm = teeth.some((t) => /^[1-4]/.test(t)) || scope === "arch" || scope === "full_mouth";
    if (!showPerm && !showPrim) showPerm = true;
  }
  const twoRows = showPerm && showPrim;
  const isOn = caseToothIsOn(c);
  const grids =
    (showPerm ? toothGrid(FDI_UPPER, FDI_LOWER, isOn, twoRows ? "Постоянные зубы" : "") : "") +
    (showPrim ? toothGrid(FDI_UPPER_P, FDI_LOWER_P, isOn, twoRows ? "Молочные зубы" : "") : "");
  const summary = caseToothSummary(c);
  return `<div class="tooth-card">
    <div class="tooth-card-head"><h2 class="tooth-card-t">Зубная формула</h2>${summary ? `<span class="tooth-summary">${esc(summary)}</span>` : ""}</div>
    <div class="tooth-grids${twoRows ? " tooth-grids--two" : ""}">${grids}</div>
  </div>`;
}

function caseGalleryStrip(media) {
  const items = (media || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!items.length) return "";
  const cells = items.map((m) => {
    const ar = (m.width && m.height) ? ` style="aspect-ratio:${m.width}/${m.height}"` : "";
    return `<button type="button" class="case-gitem"${ar} data-lb="${esc(m.preview || m.thumb || "")}" data-cap="${esc(m.caption || "")}">` +
      `<img src="${esc(m.thumb || "")}" alt="${esc(m.alt || "")}" loading="lazy"${m.width ? ` width="${m.width}"` : ""}${m.height ? ` height="${m.height}"` : ""}></button>`;
  }).join("");
  return `<div class="case-gallery"><h2 class="case-h2">Галерея</h2><div class="case-gstrip">${cells}</div></div>`;
}

/** Построчный вид товара, привязанного к кейсу (список, не карточки). */
export function caseProductRow(p) {
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name || "")}" loading="lazy">`
    : `<span class="noimg">\u2014</span>`;
  const brand = p.brand ? `<span class="cpr-brand">${esc(p.brand)}</span>` : "";
  const price = p.price_from ? "от " + fmtPrice(p.price_from) : "Цена по запросу";
  const note = p.note ? `<span class="cpr-note">${esc(p.note)}</span>` : "";
  return `<a class="cpr" href="${SITE_BASE}/product/${esc(p.slug)}/">` +
    `<span class="cpr-img">${img}</span>` +
    `<span class="cpr-main"><span class="cpr-name">${esc(p.name || "")}</span>${brand}${note}</span>` +
    `<span class="cpr-price">${price}</span></a>`;
}

export function caseProductTile(p) {
  const img = p.image
    ? `<div class="card-img"><img src="${esc(p.image)}" alt="${esc(p.name || "")}" loading="lazy"></div>`
    : `<div class="card-img"><span class="noimg">без фото</span></div>`;
  const brand = p.brand ? `<div class="card-brand">${esc(p.brand)}</div>` : "";
  const price = p.price_from ? "от " + fmtPrice(p.price_from) : "Цена по запросу";
  const note = p.note ? `<div class="case-prod-note">${esc(p.note)}</div>` : "";
  return `<a class="card pcard case-prod" href="${SITE_BASE}/product/${esc(p.slug)}/">${img}<div class="card-body"><div class="card-price">${price}</div><div class="card-name">${esc(p.name || "")}</div>${brand}${note}</div></a>`;
}

function caseJsonLd(c) {
  const obj = {
    "@context": "https://schema.org", "@type": "Article",
    headline: c.title || "",
    datePublished: c.published_at || undefined,
    image: c.cover && c.cover.og ? [c.cover.og] : undefined,
    author: c.author_line ? { "@type": "Person", name: c.author_line } : undefined,
    publisher: { "@type": "Organization", name: "ПрофиСфера" },
    mainEntityOfPage: `${SITE_BASE}/cases/${c.slug}/`,
  };
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

/** Инлайн-карточка упомянутого товара — на место маркера в теле кейса. */
function caseInlineProduct(p) {
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name || "")}" loading="lazy">`
    : `<span class="noimg">\u2014</span>`;
  const price = p.price_from ? "от " + fmtPrice(p.price_from) : "Цена по запросу";
  return `<a class="cip" href="${SITE_BASE}/product/${esc(p.slug)}/">` +
    `<span class="cip-img">${img}</span>` +
    `<span class="cip-main"><span class="cip-name">${esc(p.name || "")}</span>${p.brand ? `<span class="cip-brand">${esc(p.brand)}</span>` : ""}</span>` +
    `<span class="cip-price">${price}</span></a>`;
}
/** Подставляет карточки на место маркеров <div class="case-product" data-product="SLUG"></div>
 *  (пустые самозакрытые div'ы). Данные — из case.products[] по slug; если товара в наборе нет
 *  (не должно быть — PIM чистит), маркер просто удаляется. */
function injectCaseProducts(html, products) {
  if (!html) return "";
  const bySlug = {};
  (products || []).forEach((p) => { if (p.slug) bySlug[p.slug] = p; });
  return html.replace(/<div\b[^>]*\bdata-product="([^"]*)"[^>]*>\s*<\/div>/gi, (m, slug) => {
    const p = bySlug[slug];
    return p ? caseInlineProduct(p) : "";
  });
}

export function casePage(c, dirName) {
  const trail = [{ name: "Главная", href: `${SITE_BASE}/` }, { name: "Кейсы", href: `${SITE_BASE}/cases/` }, { name: c.title || "Кейс" }];
  const prof = CASE_PROFILE[c.case_profile] ? `<span class="case-badge case-badge--${esc(c.case_profile)} case-badge--inline">${CASE_PROFILE[c.case_profile]}</span>` : "";
  const dirs = (c.directions || []).map((d) => `<span class="case-dir">${esc(dirName ? dirName(d) : d)}</span>`).join("");
  const metaBits = [c.case_number ? `Кейс №${esc(c.case_number)}` : "", esc(c.author_line || ""), ruDate(c.published_at)].filter(Boolean).join(" · ");
  const products = (c.products || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const productsBlock = products.length
    ? `<section class="case-products"><div class="case-products-head"><h2 class="case-h2">Товары из кейса</h2><button type="button" class="btn-addall">Добавить все в корзину</button></div><div class="case-prod-list">${products.map(caseProductRow).join("")}</div></section>`
    : "";
  const body = c.body_html ? `<div class="rich case-article">${injectCaseProducts(c.body_html, c.products)}</div>` : "";

  const content = `<main class="page-shell case-page">
  ${crumbs(trail)}
  <header class="case-head">
    <div class="case-badges">${prof}${dirs}</div>
    <h1 class="case-h1">${esc(c.title || "Кейс")}</h1>
    ${metaBits ? `<div class="case-meta">${metaBits}</div>` : ""}
  </header>
  ${caseToothCard(c)}
  ${body}
  ${productsBlock}
  ${caseGalleryStrip(c.media)}
</main>
<script src="${SITE_BASE}/case.js" defer></script>`;
  return layout({
    title: `${esc(c.meta_title || c.title || "Кейс")} — ПрофиСфера`,
    description: c.meta_description || stripHtml(c.body_html || "").slice(0, 300),
    canonical: `${SITE_BASE}/cases/${c.slug}/`,
    image: c.cover && c.cover.og ? c.cover.og : null,
    imageAlt: (c.cover && c.cover.alt) || c.title || "",
    jsonLd: caseJsonLd(c),
    bodyClass: "page-case", content,
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

/* кэш конфигов фильтров по слагу категории (для страниц категорий и «бренд × категория») */
const filtersCache = {};
async function getFilters(slug) {
  if (slug in filtersCache) return filtersCache[slug];
  let f = [];
  try { f = await getJSON(`/api/categories/${slug}/filters/`); } catch (e) { f = []; }
  filtersCache[slug] = f;
  return f;
}

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
  for (const f of ["app.js", "styles.css", "product.css", "logo.svg", "render-product.js", "category-filters.js", "category-nav.js", "catalog-menu.js", "case.js", "case-filter.js", "search.js", "auth.js", "course.js", "ic-user.svg", "ic-cart.svg", "ic-cart-sm.svg", "ic-caret.svg", "ic-burger.svg", "ic-cat-tools.svg", "ic-cat-materials.svg", "ic-cat-equipment.svg", "ic-stock.svg", "ic-delivery.svg", "ic-bonus.svg", "banner-devices.png"]) {
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
  const catNameBySlug = {};
  cats.forEach((c) => { trailBySlug[c.slug] = c.trail; catNameBySlug[c.slug] = c.name; });

  // товары
  const list = await fetchList("/api/products/");

  // внешний каталог: модель + индексы (нужны уже для «домашних» крошек товара)
  const catalogConfig = JSON.parse(await readFile(path.join(ROOT, "catalog-sections-config.json"), "utf8"));
  const catName = (slug) => catNameBySlug[slug] || slug;
  const model = buildCatalogModel(catalogConfig, list, catName);
  const minSlice = (catalogConfig.settings && catalogConfig.settings.min_products_slice) ?? 3;
  const thinMode = (catalogConfig.settings && catalogConfig.settings.thin_slice_mode) || "link_to_canonical";
  const dirLookup = buildDirectionLookup(catalogConfig);
  // какие срезы «направление×категория» реально генерятся (толстые) — для ссылки в крошке
  const sliceThick = new Set();
  for (const sec of model.sections)
    for (const d of sec.directions)
      for (const g of d.leaves)
        if (g.products.length >= minSlice) sliceThick.add(`${sec.slug}|${d.slug}|${g.catSlug}`);

  const slugOf = (x) => (x && (x.slug || x)) || null;
  /** «Домашние» крошки карточки (root-relative url'ы): для товара с направлениями —
   *  Раздел → Направление → Категория (по приоритету breadcrumb_priority); без
   *  направлений — Раздел(аудитория) → Категория; фолбэк — только категория. */
  function homeTrail(detail) {
    const catSlug = detail.category && detail.category.slug;
    const catNm = (detail.category && detail.category.name) || (catSlug && catName(catSlug)) || "";
    const norm = { directions: (detail.directions || []).map(slugOf).filter(Boolean) };
    const home = resolveHomeDirection(norm, catalogConfig, dirLookup);
    const items = [];
    if (home) {
      items.push({ name: home.sectionTitle, url: `/${home.sectionSlug}/` });
      items.push({ name: home.dirTitle, url: `/${home.sectionSlug}/${home.dirSlug}/` });
      if (catSlug) {
        const thick = sliceThick.has(`${home.sectionSlug}|${home.dirSlug}|${catSlug}`);
        items.push({ name: catNm, url: thick ? `/${home.sectionSlug}/${home.dirSlug}/${catSlug}/` : `/c/${catSlug}/` });
      }
    } else {
      const aud = slugOf((detail.audiences || [])[0]);
      const sec = aud ? sectionByAudience(catalogConfig, aud) : null;
      if (sec) items.push({ name: sec.title, url: `/${sec.slug}/` });
      if (catSlug) items.push({ name: catNm, url: `/c/${catSlug}/` });
    }
    if (!items.length && catSlug) items.push({ name: catNm, url: `/c/${catSlug}/` });
    return items;
  }

  const charsBySlug = {}; // slug -> { code: value } (значения характеристик для фильтров)
  let n = 0;
  for (const item of list) {
    if (!item.slug) continue;
    const detail = await getJSON(`/api/products/${item.slug}/`);
    const map = {};
    (detail.characteristics || []).forEach((c) => { map[c.code] = c.value; });
    charsBySlug[item.slug] = map;
    const trail = homeTrail(detail);
    const dir = path.join(OUT, "product", item.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), productPage(detail, trail), "utf8");
    urls.push(`${SITE_BASE}/product/${item.slug}/`);
    n++;
  }

  // бренды
  const brands = await fetchList("/api/brands/");
  let nb = 0, nbc = 0;
  for (const b of brands) {
    if (!b.slug) continue;
    const prods = await fetchList(`/api/products/?brand=${b.id}`);
    // категории, где у бренда есть товары (по поддереву) → подрезанное дерево + счётчики
    const keep = new Set();
    const brandCounts = {};
    for (const c of cats) {
      const cnt = prods.filter((p) => c.slugs.includes(p.category)).length;
      if (cnt > 0) { keep.add(c.slug); brandCounts[c.slug] = cnt; }
    }
    const pruned = pruneTree(tree, keep);

    const dir = path.join(OUT, "brand", b.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), brandPage(b, prods, pruned, brandCounts), "utf8");
    urls.push(`${SITE_BASE}/brand/${b.slug}/`);
    nb++;

    // страницы «бренд × категория» — для каждой категории из подрезанного дерева
    for (const c of cats) {
      if (!keep.has(c.slug)) continue;
      const catProds = prods.filter((p) => c.slugs.includes(p.category));
      const filters = await getFilters(c.slug);
      const codes = filters.map((f) => f.code);
      const bset = new Set();
      const values = {};
      for (const p of catProds) {
        const entry = { brand: p.brand || null };
        if (p.brand) bset.add(p.brand);
        const ch = charsBySlug[p.slug] || {};
        for (const code of codes) if (code in ch) entry[code] = ch[code];
        values[p.slug] = entry;
      }
      const filterData = { filters, brands: Array.from(bset).sort(), values };
      const cdir = path.join(OUT, "brand", b.slug, c.slug);
      await mkdir(cdir, { recursive: true });
      await writeFile(path.join(cdir, "index.html"),
        brandCategoryPage(b, c, catProds, filterData, pruned, brandCounts), "utf8");
      urls.push(`${SITE_BASE}/brand/${b.slug}/${c.slug}/`);
      nbc++;
    }
  }
  // страница со списком всех брендов
  await mkdir(path.join(OUT, "brands"), { recursive: true });
  await writeFile(path.join(OUT, "brands", "index.html"), brandsPage(brands), "utf8");
  urls.push(`${SITE_BASE}/brands/`);

  // количество товаров по поддереву каждой категории (счётчики в навигации)
  const countBySlug = {};
  for (const c of cats) countBySlug[c.slug] = list.filter((p) => c.slugs.includes(p.category)).length;
  await writeFile(path.join(OUT, "counts.json"), JSON.stringify(countBySlug), "utf8");
  await writeFile(path.join(OUT, "tree.json"), JSON.stringify(tree), "utf8");

  // индекс поиска (клиентский) + страница результатов /search/
  const searchIndex = list.filter((p) => p.slug).map((p) => ({
    slug: p.slug,
    name: p.name || "",
    sku: p.manufacturer_sku || "",
    brand: p.brand || "",
    thumb: p.thumbnail || "",
    cat: catNameBySlug[p.category] || "",
  }));
  await writeFile(path.join(OUT, "search-index.json"), JSON.stringify(searchIndex), "utf8");
  await mkdir(path.join(OUT, "search"), { recursive: true });
  await writeFile(path.join(OUT, "search", "index.html"), searchPage(), "utf8");

  // категории (разделы) — cats уже собраны выше
  let nc = 0;
  for (const c of cats) {
    if (!c.slug) continue;
    const prods = list.filter((p) => c.slugs.includes(p.category)); // включая товары вложенных категорий
    // конфиг фильтров (с наследованием) + значения товаров только по нужным кодам
    const filters = await getFilters(c.slug);
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

  // ---------- внешний каталог: разделы «для кого» → направления → срезы ----------
  // (catalogConfig / model / minSlice / thinMode собраны выше — до крошек товара)
  let nsec = 0, ndir = 0, ngroup = 0, nslice = 0;
  for (const section of model.sections) {
    const sdir = path.join(OUT, section.slug);
    await mkdir(sdir, { recursive: true });
    await writeFile(path.join(sdir, "index.html"), sectionPage(section, minSlice, thinMode), "utf8");
    urls.push(`${SITE_BASE}/${section.slug}/`);
    nsec++;

    for (const dir of section.directions) {
      const ddir = path.join(OUT, section.slug, dir.slug);
      await mkdir(ddir, { recursive: true });
      await writeFile(path.join(ddir, "index.html"), directionPage(section, dir, minSlice, thinMode), "utf8");
      urls.push(`${SITE_BASE}/${section.slug}/${dir.slug}/`);
      ndir++;

      // страницы презентационных групп (напр. «Реставрация») — направление ∩ категории группы
      for (const grp of (dir.presentation && dir.presentation.groups) || []) {
        const grpDir = path.join(OUT, section.slug, dir.slug, grp.slug);
        await mkdir(grpDir, { recursive: true });
        await writeFile(path.join(grpDir, "index.html"),
          directionGroupPage(section, dir, grp, minSlice, thinMode), "utf8");
        if (grp.total >= minSlice) urls.push(`${SITE_BASE}${grp.url}`);
        ngroup++;
      }

      for (const g of dir.leaves) {
        if (g.products.length < minSlice) continue; // тонкий срез не генерим — ведёт на канон /c/
        // фильтры среза (та же машинерия, что у страницы категории), но только по товарам среза
        const filters = await getFilters(g.catSlug);
        const codes = filters.map((f) => f.code);
        const bset = new Set();
        const values = {};
        for (const p of g.products) {
          const entry = { brand: p.brand || null };
          if (p.brand) bset.add(p.brand);
          const ch = charsBySlug[p.slug] || {};
          for (const code of codes) if (code in ch) entry[code] = ch[code];
          values[p.slug] = entry;
        }
        const filterData = { filters, brands: Array.from(bset).sort(), values };
        const full = countBySlug[g.catSlug] || g.products.length;
        const gdir = path.join(OUT, section.slug, dir.slug, g.catSlug);
        await mkdir(gdir, { recursive: true });
        await writeFile(path.join(gdir, "index.html"),
          directionCategoryPage(section, dir, g, full, filterData, minSlice, thinMode), "utf8");
        // в sitemap только самостоятельные срезы (не canonical на /c/)
        if (g.products.length < full) urls.push(`${SITE_BASE}/${section.slug}/${dir.slug}/${g.catSlug}/`);
        nslice++;
      }
    }
  }
  // данные для клиентского мега-меню (инкремент C)
  await writeFile(path.join(OUT, "menu.json"), JSON.stringify(buildMenuData(model, catalogConfig.settings)), "utf8");

  // ---------- раздел «Кейсы» ----------
  const dirName = (slug) => (dirLookup[slug] && dirLookup[slug].dirTitle) || slug;
  const allCases = await fetchList("/api/cases/");                 // свежие вперёд
  let featuredCases = [];
  try { featuredCases = await fetchList("/api/cases/?featured=1"); } catch (e) { featuredCases = []; }
  // Детальные данные тянем один раз: в них есть directions/case_profile (список их может не
  // отдавать — из-за этого фильтры подразделов были пустыми). Нужны и фильтрам, и страницам кейсов.
  const fullBySlug = {};
  const fullCases = [];
  for (const tile of allCases) {
    if (!tile.slug) continue;
    const full = await getJSON(`/api/cases/${tile.slug}/`);
    fullBySlug[tile.slug] = full;
    fullCases.push(full);
  }
  const enrich = (t) => (t && fullBySlug[t.slug]) || t;
  const stomCases = fullCases.filter((c) => c.case_profile === "clinical" || c.case_profile === "joint");
  const zubCases = fullCases.filter((c) => c.case_profile === "lab" || c.case_profile === "joint");
  const rootCases = (featuredCases.length ? featuredCases : allCases).map(enrich); // корень: избранные, иначе свежие
  const subsections = [
    { title: "Стоматологические кейсы", slug: "stomatologicheskie", count: stomCases.length },
    { title: "Зуботехнические кейсы", slug: "zubotehnicheskie", count: zubCases.length },
  ];
  await mkdir(path.join(OUT, "cases"), { recursive: true });
  await writeFile(path.join(OUT, "cases", "index.html"), casesRootPage(rootCases, subsections, dirName), "utf8");
  urls.push(`${SITE_BASE}/cases/`);
  for (const [sslug, stitle, scases] of [
    ["stomatologicheskie", "Стоматологические кейсы", stomCases],
    ["zubotehnicheskie", "Зуботехнические кейсы", zubCases],
  ]) {
    if (!scases.length) continue;
    await mkdir(path.join(OUT, "cases", sslug), { recursive: true });
    await writeFile(path.join(OUT, "cases", sslug, "index.html"), casesSubPage(stitle, sslug, scases, dirName), "utf8");
    urls.push(`${SITE_BASE}/cases/${sslug}/`);
  }
  // детальные страницы кейсов (данные уже загружены выше)
  for (const tile of allCases) {
    const full = fullBySlug[tile.slug];
    if (!full) continue;
    const cdir = path.join(OUT, "cases", tile.slug);
    await mkdir(cdir, { recursive: true });
    await writeFile(path.join(cdir, "index.html"), casePage(full, dirName), "utf8");
    urls.push(`${SITE_BASE}/cases/${tile.slug}/`);
  }
  const ncases = allCases.length;

  // каталог (index) + sitemap + robots
  await writeFile(path.join(OUT, "index.html"), await bakeIndex(list), "utf8");
  await writeFile(path.join(OUT, "sitemap.xml"), sitemap(urls), "utf8");
  await writeFile(path.join(OUT, "robots.txt"), robots(), "utf8");

  console.log(`Готово: товаров ${n}, брендов ${nb} (стр. бренд×категория ${nbc}), категорий ${nc}, внешний каталог: разделов ${nsec}, направлений ${ndir}, групп ${ngroup}, срезов ${nslice}, кейсов ${ncases}, всего URL в sitemap ${urls.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Сборка упала:", e.message);
    process.exit(1);
  });
}
