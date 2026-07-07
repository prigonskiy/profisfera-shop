const API_BASE = "https://profisfera-pim.ru";

const api = (p) => API_BASE.replace(/\/$/,"") + p;
const state = { view:"catalog", brand:null, brands:[], audience:null, direction:null, category:null, menu:[], next:null };
let catCounts = {};
const CAT_ICON = { "инструменты":"ic-cat-tools.svg", "материалы":"ic-cat-materials.svg", "оборудование":"ic-cat-equipment.svg" };
function catIcon(name){ const f = CAT_ICON[(name||"").trim().toLowerCase()]; return f ? `<img class="nav-ic" src="${f}" alt="" width="20" height="20">` : ""; }
function buildMainnavCats(roots){
  const box = $("#mainnav-cats"); if(!box) return;
  // разделы рядом с «Каталогом»; категории — внутри кнопки «Каталог»
  box.innerHTML = `<a class="nav-cat-link" href="brands/">Бренды</a>`
    + `<span class="nav-cat-link nav-soon" title="Скоро">Кейсы</span>`
    + `<span class="nav-cat-link nav-soon" title="Скоро">Справочник</span>`;
}

const $ = (s,r=document)=>r.querySelector(s);
const el = (t,c)=>{const e=document.createElement(t); if(c) e.className=c; return e;};
function flag(code){ if(!code||code.length!==2) return ""; return code.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0))); }
function esc(s){ const d=document.createElement("div"); d.textContent=s==null?"":String(s); return d.innerHTML; }
function fmtPrice(v){ const n=parseFloat(v); if(isNaN(n)) return ""; let rub=Math.floor(Math.abs(n)); let kop=Math.round((Math.abs(n)-rub)*100); if(kop===100){rub+=1;kop=0;} const s=String(rub).replace(/\B(?=(\d{3})+(?!\d))/g,"\u00A0"); return (n<0?"\u2212":"")+s+(kop>0?","+String(kop).padStart(2,"0"):"")+"\u00A0\u20bd"; }
function fmtDate(iso){ const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}.${m[2]}.${m[1]}`:""; }
function docValidity(d){
  if(d.is_perpetual) return "Бессрочный";
  if(d.valid_until) return "Действует до "+fmtDate(d.valid_until);
  return "";
}

async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "Accept":"application/json" }});
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}

/* ---------- навигация: аудитории + направления ---------- */
async function loadMenu(){
  state.menu = await fetchJSON(api("/api/audiences/menu/"));
  renderAudiences(); renderDirections();
}
function renderAudiences(){
  const box = $("#audiences"); box.innerHTML="";
  const eb = el("span","eyebrow"); eb.textContent="Для кого"; box.appendChild(eb);
  box.appendChild(pill("Все аудитории", state.audience===null, ()=>{ state.audience=null; state.direction=null; onFilter(); }));
  state.menu.forEach(a=>{
    box.appendChild(pill((a.icon? a.icon+" ":"")+a.name, state.audience===a.slug, ()=>{
      state.audience = a.slug; state.direction=null; onFilter();
    }));
  });
}
function pill(label, active, on){
  const b=el("button","pill"); b.innerHTML=esc(label); b.setAttribute("aria-pressed", active);
  b.onclick=on; return b;
}
function renderDirections(){
  const box=$("#directions"); box.innerHTML="";
  const aud = state.menu.find(a=>a.slug===state.audience);
  if(!aud || !aud.directions.length) return;
  box.appendChild(chip("Все направления", state.direction===null, ()=>{ state.direction=null; onFilter(); }));
  aud.directions.forEach(d=>{
    box.appendChild(chip(d.name, state.direction===d.slug, ()=>{ state.direction=d.slug; onFilter(); }));
  });
}
function chip(label, active, on){
  const b=el("button","chip"); b.textContent=label; b.setAttribute("aria-pressed",active); b.onclick=on; return b;
}

/* ---------- категории (дерево-хребет) ---------- */
async function loadTree(){
  // дерево теперь живёт в мегаменю «Каталог»; на главной из него строим только верхние ссылки навбара
  const roots = await fetchJSON(api("/api/categories/tree/"));
  buildMainnavCats(roots);
}
function treeNode(cat){
  const li=el("li"); li.appendChild(treeBtn(cat,false));
  if(cat.children && cat.children.length){
    const sub=el("ul","sub"); cat.children.forEach(ch=>sub.appendChild(treeNode(ch))); li.appendChild(sub);
  }
  return li;
}
function treeBtn(cat, isReset){
  const a=el("a", isReset?"reset":"");
  a.textContent=cat.name;
  a.href = isReset ? "./" : ("c/"+encodeURIComponent(cat.slug)+"/");
  if(!isReset && catCounts && catCounts[cat.slug]!=null){ const n=el("span","tree-count"); n.textContent=catCounts[cat.slug]; a.appendChild(n); }
  return a;
}

/* ---------- товары ---------- */
function onFilter(){
  renderAudiences(); renderDirections();
  $("#heading").textContent = headingText();
  loadProducts(true);
}
function headingText(){
  const a=state.menu.find(x=>x.slug===state.audience);
  const d=a && a.directions.find(x=>x.slug===state.direction);
  if(d) return a.name+" · "+d.name;
  if(a) return a.name;
  return "Каталог";
}
function queryString(){
  if(state.view==="brand" && state.brand) return "brand="+encodeURIComponent(state.brand);
  const q=new URLSearchParams();
  if(state.audience) q.set("audience", state.audience);
  if(state.direction) q.set("direction", state.direction);
  if(state.category) q.set("category", state.category);
  return q.toString();
}

/* ---------- навигация: Каталог / Производители ---------- */
function setView(v){
  state.view = v;
  if(v!=="brand") state.brand = null;
  const bh=$("#brandhero"); if(bh) bh.innerHTML = "";
  const more=$("#more"); if(more) more.style.display = "none";
  const h=$("#heading");
  if(v==="catalog"){ if(h) h.textContent = "Популярные товары"; loadProducts(true); }
  else if(v==="brands"){ if(h) h.textContent = "Производители"; loadBrands(); }
  // для v==="brand" наполнение делает openBrand()
}

/* ---------- производители ---------- */
function stripHtml(s){
  if(!s) return "";
  const d=document.createElement("div"); d.innerHTML=s;
  return (d.textContent||"").replace(/\s+/g," ").trim();
}
function emptyMsg(title, text){
  const d=el("div","state"); d.innerHTML="<h3>"+esc(title)+"</h3><p>"+esc(text)+"</p>"; return d;
}
async function loadBrands(){
  const grid=$("#grid"); grid.innerHTML="";
  for(let i=0;i<4;i++) grid.appendChild(el("div","skel"));
  try{
    const data = await fetchJSON(api("/api/brands/"));
    const items = data.results || data;
    if(reset && state.view==="catalog") shuffle(items);   // главная = случайная витрина «топ-товаров» (бизнес-логика позже)
    state.brands = items;
    grid.innerHTML="";
    $("#count").innerHTML = "<b>"+items.length+"</b> производителей";
    if(!items.length){ grid.appendChild(emptyMsg("Производителей пока нет","Добавьте бренды в PIM.")); return; }
    items.forEach(b=>grid.appendChild(brandCard(b)));
  }catch(e){ grid.innerHTML=""; grid.appendChild(errorState(e)); }
}
function brandCard(b){
  const c=el("a","card brandcard"); c.href="brand/"+encodeURIComponent(b.slug)+"/";
  const ph=el("div","ph");
  if(b.logo){ const im=el("img"); im.src=b.logo; im.alt=b.name; im.loading="lazy"; ph.appendChild(im); }
  else { const n=el("div","noimg"); n.textContent=b.name; ph.appendChild(n); }
  c.appendChild(ph);
  const body=el("div","body");
  const nm=el("div","nm"); nm.textContent=b.name; body.appendChild(nm);
  const txt=stripHtml(b.description);
  if(txt){ const ds=el("div","ds"); ds.textContent=txt; body.appendChild(ds); }
  c.appendChild(body);
  return c;
}
async function openBrand(slug){
  setView("brand");
  const hero=$("#brandhero");
  hero.innerHTML="<div class='skel' style='height:140px'></div>";
  $("#heading").textContent=""; $("#count").innerHTML=""; $("#grid").innerHTML="";
  try{
    const b = await fetchJSON(api("/api/brands/"+encodeURIComponent(slug)+"/"));
    state.brand = b.id;   // деталь ищем по slug, а товары фильтруем по числовому id
    let h="<button class='back' onclick=\"setView('brands')\">← Все производители</button>";
    h+="<div class='brandhead'>";
    if(b.logo) h+="<div class='blogo'><img src='"+esc(b.logo)+"' alt='"+esc(b.name)+"'></div>";
    h+="<div class='brandinfo'><h1 class='btitle'>"+esc(b.name)+"</h1>";
    h+= b.description ? "<div class='rich'>"+b.description+"</div>"
                      : "<p style='color:var(--muted)'>Описание производителя пока не заполнено в PIM.</p>";
    h+="</div></div>";
    hero.innerHTML=h;
    $("#heading").textContent="Товары производителя";
    loadProducts(true);   // queryString() вернёт brand=<id>
  }catch(e){ hero.innerHTML=""; $("#grid").innerHTML=""; $("#grid").appendChild(errorState(e)); }
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
async function loadProducts(reset){
  const grid=$("#grid");
  if(reset){ grid.innerHTML=""; for(let i=0;i<6;i++){const s=el("div","skel");grid.appendChild(s);} $("#more").style.display="none"; }
  try{
    const url = reset ? api("/api/products/?"+queryString()) : state.next;
    const data = await fetchJSON(url);
    const items = data.results || data;
    state.next = data.next || null;
    if(reset){ grid.innerHTML=""; $("#count").innerHTML = (data.count!=null? "<b>"+data.count+"</b> товаров" : ""); }
    if(reset && items.length===0){ grid.appendChild(emptyState()); return; }
    items.forEach(p=>grid.appendChild(card(p)));
    $("#more").style.display = state.next ? "block" : "none";
  }catch(e){
    grid.innerHTML=""; grid.appendChild(errorState(e));
  }
}
function card(p){
  const c=el("a","card pcard"); c.href="product/"+encodeURIComponent(p.slug)+"/";
  const ph = p.thumbnail
    ? `<div class="card-img"><img src="${esc(p.thumbnail)}" alt="${esc(p.name)}" loading="lazy"></div>`
    : `<div class="card-img"><span class="noimg">без фото</span></div>`;
  const art = p.manufacturer_sku ? `<div class="card-sku">Артикул: ${esc(p.manufacturer_sku)}</div>` : "";
  const brand = p.brand ? `<div class="card-brand">${esc(p.brand)}</div>` : "";
  c.innerHTML = ph + `<div class="card-body">${art}<div class="card-price">${p.price_from ? "от " + fmtPrice(p.price_from) : "Цена по запросу"}</div><div class="card-name">${esc(p.name)}</div>${brand}<div class="card-delivery"><img src="ic-delivery.svg" alt="" width="14" height="14"><span>Доставка от 1 дня</span></div></div><span class="btn-cart" title="Корзина — скоро"><img src="ic-cart-sm.svg" alt="" width="14" height="13"><span>В корзину</span></span>`;
  return c;
}
function emptyState(){
  const d=el("div","state");
  d.innerHTML="<h3>Под этот срез товаров нет</h3><p>Измените аудиторию, направление или категорию — или добавьте товарам эти метки в PIM.</p>";
  return d;
}
function errorState(e){
  const d=el("div","state");
  d.innerHTML="<h3>Не удалось связаться с PIM</h3>"+
    "<p>Проверьте, что в <code>API_BASE</code> указан верный адрес и что на стороне PIM включён CORS для этого домена.</p>"+
    "<p style='margin-top:8px;font-size:12px'>"+esc(e.message)+" → "+esc(API_BASE)+"</p>";
  return d;
}

/* ---------- карточка товара (drawer) ---------- */
async function openProduct(slug){
  const dr=$("#drawer"), sc=$("#scrim");
  dr.innerHTML="<div class='dr-head'><button class='dr-close' onclick='closeDrawer()'>×</button></div><div class='dr-body'><div class='skel' style='height:200px'></div></div>";
  dr.classList.add("open"); sc.classList.add("open"); dr.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  try{
    const p = await fetchJSON(api("/api/products/"+slug+"/"));
    renderProduct(p);
  }catch(e){
    $(".dr-body",dr).innerHTML="<div class='state'><h3>Не удалось загрузить карточку</h3><p>"+esc(e.message)+"</p></div>";
  }
}
function closeDrawer(){
  $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden","true"); document.body.style.overflow="";
}
function specValue(ch){
  let v=ch.value;
  if(Array.isArray(v)) v=v.join(", ");
  else if(v===true) v="Да"; else if(v===false) v="Нет";
  if(v===null||v===undefined||v==="") return "—";
  return esc(v)+(ch.unit? " "+esc(ch.unit):"");
}
function renderProduct(p){
  const general=(p.characteristics||[]).filter(c=>c.is_global);
  const cat=(p.characteristics||[]).filter(c=>!c.is_global);
  const imgs=p.images||[];
  const main = imgs[0] ? imgs[0].image : (p.thumbnail||null);

  let html="<div class='dr-head'><button class='dr-close' onclick='closeDrawer()'>×</button>";
  html+= p.brand && p.brand.name ? "<button class='brandlink' onclick=\"closeDrawer(); openBrand('"+p.brand.slug+"')\">"+esc(p.brand.name)+"</button>" : "";
  html+= "<h2 class='dr-title'>"+esc(p.name)+"</h2>";
  html+= "<div class='dr-tags'>";
  (p.audiences||[]).forEach(a=> html+="<span class='tag2 aud'>"+esc(a.name)+"</span>");
  (p.directions||[]).forEach(d=> html+="<span class='tag2'>"+esc(d.name)+"</span>");
  html+="</div></div>";

  html+="<div class='dr-body'>";
  // галерея
  if(main){
    html+="<div class='dr-gallery'><div class='dr-main'><img id='drMain' src='"+esc(main)+"' alt='"+esc(p.name)+"'></div>";
    if(imgs.length>1){ html+="<div class='dr-thumbs'>"+imgs.map(im=>"<img src='"+esc(im.image)+"' alt='"+esc(im.alt||"")+"' onclick=\"document.getElementById('drMain').src=this.src\">").join("")+"</div>"; }
    html+="</div>";
  }
  if(p.short_description){ html+="<p style='color:var(--muted);margin:8px 0 0'>"+esc(p.short_description)+"</p>"; }

  // переключатель вариантов
  if(p.group && p.group.variants && p.group.variants.length>1){
    html+="<div class='section variants'><h3>Серия «"+esc(p.group.name)+"»</h3>";
    const levelName = (p.group.levels[0]||{}).name;
    const buckets={};
    p.group.variants.forEach(v=>{ const key=levelName? (v.levels[levelName]||"—") : "—"; (buckets[key]=buckets[key]||[]).push(v); });
    Object.keys(buckets).forEach(k=>{
      html+="<div class='grp'>";
      if(levelName && k!=="—") html+="<div class='glabel'>"+esc(levelName)+": "+esc(k)+"</div>";
      html+="<div class='vrow'>"+buckets[k].map(v=>
        "<button class='vbtn' aria-current='"+(v.is_current?"true":"false")+"' "+(v.is_current?"":"onclick=\"openProduct('"+esc(v.slug)+"')\"")+">"+esc(v.label)+"</button>"
      ).join("")+"</div></div>";
    });
    html+="</div>";
  }

  // ключевые идентификаторы (PIM-поля — моноширинным)
  const idRows=[];
  if(p.manufacturer_sku) idRows.push(["Артикул", "<span class='mono'>"+esc(p.manufacturer_sku)+"</span>"]);
  if(p.gtin) idRows.push(["Штрих-код (GTIN)", "<span class='mono'>"+esc(p.gtin)+"</span>"]);
  if(p.tnved_code) idRows.push(["Код ТН ВЭД", "<span class='mono'>"+esc(p.tnved_code)+"</span>"]);
  if(p.country_of_origin) idRows.push(["Страна", flag(p.country_of_origin.code)+" "+esc(p.country_of_origin.name)]);
  if(p.category && p.category.name) idRows.push(["Категория", esc(p.category.name)]);
  if(idRows.length){
    html+="<div class='section'><h3>Идентификация</h3><dl class='dl'>"+
      idRows.map(r=>"<dt>"+r[0]+"</dt><dd>"+r[1]+"</dd>").join("")+"</dl></div>";
  }

  // характеристики — общие и категорийные раздельно (как в PIM)
  if(general.length){
    html+="<div class='section'><h3>Общие характеристики</h3>"+
      general.map(c=>"<div class='spec'><span class='k'>"+esc(c.name)+"</span><span class='v'>"+specValue(c)+"</span></div>").join("")+"</div>";
  }
  if(cat.length){
    html+="<div class='section'><h3>Характеристики категории</h3>"+
      cat.map(c=>"<div class='spec'><span class='k'>"+esc(c.name)+"</span><span class='v'>"+specValue(c)+"</span></div>").join("")+"</div>";
  }

  // полное описание (HTML из TinyMCE — доверенный контент PIM)
  if(p.full_description){
    html+="<div class='section'><h3>Описание</h3><div class='rich'>"+p.full_description+"</div></div>";
  }

  // логистика
  const lg=p.logistics||{};
  if(lg.gross_width_mm||lg.gross_height_mm||lg.gross_depth_mm||lg.gross_weight_kg){
    html+="<div class='section'><h3>Логистика (брутто)</h3><dl class='dl'>";
    if(lg.gross_width_mm) html+="<dt>Ширина</dt><dd>"+esc(lg.gross_width_mm)+" мм</dd>";
    if(lg.gross_height_mm) html+="<dt>Высота</dt><dd>"+esc(lg.gross_height_mm)+" мм</dd>";
    if(lg.gross_depth_mm) html+="<dt>Глубина</dt><dd>"+esc(lg.gross_depth_mm)+" мм</dd>";
    if(lg.gross_weight_kg) html+="<dt>Масса</dt><dd>"+esc(lg.gross_weight_kg)+" кг</dd>";
    html+="</dl></div>";
  }

  // документы — плитки: тип, название, номер, срок, скачивание
  if(p.documents && p.documents.length){
    html+="<div class='section'><h3>Документы</h3><div class='doc-grid'>"+
      p.documents.map(d=>{
        const sub=[]; if(d.number) sub.push("№ "+esc(d.number));
        const val=docValidity(d); if(val) sub.push(esc(val));
        return "<a class='doc-tile' href='"+esc(d.file)+"' target='_blank' rel='noopener'>"+
          "<span class='doc-ic'>PDF</span>"+
          "<span class='doc-meta'>"+
            (d.doc_type_display? "<span class='doc-type'>"+esc(d.doc_type_display)+"</span>" : "")+
            "<span class='doc-name'>"+esc(d.name)+"</span>"+
            (sub.length? "<span class='doc-sub'>"+sub.join(" · ")+"</span>" : "")+
          "</span>"+
          "<span class='doc-dl'>скачать</span>"+
        "</a>";
      }).join("")+"</div></div>";
  }

  html+="</div>";
  $("#drawer").innerHTML=html;
}

$("#scrim").onclick=closeDrawer;
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeDrawer(); });
$("#more").onclick=()=>loadProducts(false);

/* ---------- старт ---------- */
(async function init(){
  document.querySelectorAll(".navtab").forEach(a=> a.onclick=(e)=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.button) return;   // дать открыть в новой вкладке
    e.preventDefault();
    setView(a.dataset.view);
    history.replaceState(null,"",a.getAttribute("href"));     // адрес отражает раздел
  });
  try{
    await loadTree();
  }catch(e){ /* меню/дерево могли не загрузиться — товары покажут ошибку сами */ }
  setView("catalog");
})();
