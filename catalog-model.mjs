/**
 * Модель «внешнего каталога» (для кого → направление → листовая категория).
 * Чистые функции без Node-API: используются в build.mjs (SSG) и могут быть
 * переиспользованы на клиенте (мега-меню). Источник структуры — конфиг-матрица
 * catalog-sections-config.json; источник данных — список товаров из /api/products/
 * (у товара: audiences: [slug], directions: [slug], category: <leaf-slug>).
 */

/** Товар относится к направлению, если хотя бы один facet-slug направления есть
 *  в его directions. facet может быть строкой или массивом (склейка направлений). */
export function matchesDirection(p, facet) {
  const set = Array.isArray(facet) ? facet : [facet];
  const dirs = p.directions || [];
  return set.some((f) => dirs.includes(f));
}

/** Группировка товаров по листовой категории (p.category = slug).
 *  catName(slug) → человекочитаемое имя категории. Сортировка: по числу товаров
 *  убыв., затем по имени. */
export function groupByCategory(products, catName) {
  const by = new Map();
  for (const p of products) {
    const slug = p.category || "";
    if (!by.has(slug)) by.set(slug, []);
    by.get(slug).push(p);
  }
  return [...by.entries()]
    .map(([slug, items]) => ({ catSlug: slug, catName: (catName && catName(slug)) || slug, products: items }))
    .sort((a, b) => b.products.length - a.products.length || a.catName.localeCompare(b.catName, "ru"));
}

/** Полная модель каталога. Пороговые отсечки — из config.settings.
 *  Возвращает { sections: [ { slug,title,order,audience,url,total,
 *    directions:[ {slug,title,seoTitle,order,url,total,groups,products} ],
 *    audienceGroups } ] }.
 *  audienceGroups заполняется только у разделов без направлений (общая медицина / пациент). */
/** Презентационная раскладка листьев направления по группам из конфига (вариант B).
 *  Группа — набор листовых категорий (categories) с заголовком; задаётся на паре
 *  направление×категория. Листья вне групп попадают в tail. Пустые группы (нет
 *  товаров под их категориями в этом направлении) отбрасываются. Возвращает
 *  { groups: [ {slug,title,seoTitle,order,url,leaves,total} ], tail: [leaves] }. */
export function buildPresentation(dirConfig, leaves, sectionSlug, dirSlug) {
  const cfg = dirConfig.groups || [];
  if (!cfg.length) return { groups: [], tail: leaves };
  const leafBySlug = new Map(leaves.map((l) => [l.catSlug, l]));
  const claimed = new Set();
  const groups = cfg
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((g) => {
      const gLeaves = (g.categories || []).map((cs) => leafBySlug.get(cs)).filter(Boolean);
      gLeaves.forEach((l) => claimed.add(l.catSlug));
      return {
        slug: g.slug,
        title: g.title,
        seoTitle: g.seo_title || g.title,
        order: g.order ?? 0,
        url: `/${sectionSlug}/${dirSlug}/${g.slug}/`,
        leaves: gLeaves,
        total: gLeaves.reduce((s, l) => s + l.products.length, 0),
      };
    })
    .filter((g) => g.leaves.length); // группы без товаров не показываем
  const tail = leaves.filter((l) => !claimed.has(l.catSlug));
  return { groups, tail };
}

export function buildCatalogModel(config, products, catName) {
  const s = config.settings || {};
  const minSection = s.min_products_section ?? 3;
  const minSlice = s.min_products_slice ?? 3;
  const sections = [];

  for (const sec of config.top_sections || []) {
    // все товары аудитории раздела (для честного тотала и для разделов без направлений)
    const audienceProducts = products.filter((p) => (p.audiences || []).includes(sec.audience));

    const directions = [];
    for (const d of sec.directions || []) {
      const prods = products.filter((p) => matchesDirection(p, d.facet));
      if (prods.length < minSlice) continue; // тонкое направление не выводим
      const leaves = groupByCategory(prods, catName);
      directions.push({
        slug: d.slug,
        title: d.title,
        seoTitle: d.seo_title || d.title,
        seoIntro: d.seo_intro || "",
        order: d.order ?? 0,
        url: `/${sec.slug}/${d.slug}/`,
        total: prods.length,
        leaves,                                           // плоские листовые категории направления
        presentation: buildPresentation(d, leaves, sec.slug, d.slug), // { groups: [...], tail: [...] }
        products: prods,
      });
    }
    directions.sort((a, b) => a.order - b.order);

    const hasDirections = (sec.directions || []).length > 0;
    const audienceGroups = hasDirections ? null : groupByCategory(audienceProducts, catName);

    // раздел выводим, если есть хоть одно направление, либо (без направлений) достаточно товаров аудитории
    const keep = directions.length > 0 || (!hasDirections && audienceProducts.length >= minSection);
    if (!keep) continue;

    sections.push({
      slug: sec.slug,
      title: sec.title,
      order: sec.order ?? 0,
      audience: sec.audience,
      url: `/${sec.slug}/`,
      total: audienceProducts.length, // уникальные товары аудитории (без двойного счёта по направлениям)
      directions,
      audienceGroups,
    });
  }
  sections.sort((a, b) => a.order - b.order);
  return { sections };
}

/** Индекс: facet-slug направления → куда он монтируется (раздел + направление).
 *  Учитывает склейку (несколько facet → одно направление витрины). */
export function buildDirectionLookup(config) {
  const map = {};
  for (const sec of config.top_sections || []) {
    for (const d of sec.directions || []) {
      const facets = Array.isArray(d.facet) ? d.facet : [d.facet];
      for (const f of facets) {
        map[f] = {
          sectionSlug: sec.slug, sectionTitle: sec.title,
          dirSlug: d.slug, dirTitle: d.title,
          dirUrl: `/${sec.slug}/${d.slug}/`, sectionUrl: `/${sec.slug}/`,
        };
      }
    }
  }
  return map;
}

/** Домашнее направление товара = первое из breadcrumb_priority, что есть в его
 *  directions (детерминированно). Фолбэк — любое известное направление товара.
 *  null → у товара нет направлений (крошка строится по аудитории). */
export function resolveHomeDirection(p, config, lookup) {
  const dirs = new Set(p.directions || []);
  for (const slug of config.breadcrumb_priority || []) {
    if (dirs.has(slug) && lookup[slug]) return lookup[slug];
  }
  for (const slug of p.directions || []) if (lookup[slug]) return lookup[slug];
  return null;
}

/** Раздел «для кого» по slug аудитории (для фолбэк-крошки товаров без направлений). */
export function sectionByAudience(config, audienceSlug) {
  return (config.top_sections || []).find((sec) => sec.audience === audienceSlug) || null;
}

/** Лёгкая структура для клиентского мега-меню (пишется в catalog.json).
 *  Без списков товаров — заголовки, URL (root-relative) и счётчики. У каждой листовой
 *  группы готовый target-url: толстая (>= min_products_slice) → свой срез, тонкая →
 *  каноническая /c/ (или скрыта при thin_slice_mode='hide'). */
export function catalogMenuData(model, settings) {
  const minSlice = (settings && settings.min_products_slice) ?? 3;
  const thinMode = (settings && settings.thin_slice_mode) || "link_to_canonical";
  const groupUrl = (sectionSlug, dirSlug, g) => {
    if (g.products.length >= minSlice) return `/${sectionSlug}/${dirSlug}/${g.catSlug}/`;
    if (thinMode === "hide") return null;
    return `/c/${g.catSlug}/`;
  };
  return model.sections.map((sec) => ({
    slug: sec.slug, title: sec.title, url: sec.url, total: sec.total,
    directions: sec.directions.map((d) => ({
      slug: d.slug, title: d.title, url: d.url, total: d.total,
      groups: d.leaves
        .map((g) => ({ slug: g.catSlug, name: g.catName, total: g.products.length, url: groupUrl(sec.slug, d.slug, g) }))
        .filter((g) => g.url), // hide-режим убирает тонкие
    })),
    // для разделов без направлений — сразу листовые группы (канон /c/)
    groups: sec.audienceGroups
      ? sec.audienceGroups.map((g) => ({ slug: g.catSlug, name: g.catName, total: g.products.length, url: `/c/${g.catSlug}/` }))
      : [],
  }));
}
