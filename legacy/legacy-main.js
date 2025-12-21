// Всегда начинаем страницу с верха
window.history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ==== CONFIG ====
const MEDIA_BASE_URL = "https://pub-3bc4f2b4686e4f2da3620e629a5a1aae.r2.dev/";


// Load tags.json
async function loadTags() {
  const res = await fetch("https://pub-3bc4f2b4686e4f2da3620e629a5a1aae.r2.dev/tags.json");
  if (!res.ok) throw new Error("Не удалось загрузить tags.json");
  return res.json();
}

// Load optional cases.json (titles/descriptions). Safe fallback.
// Expected format (flexible):
// {
//   "0003.jpg": { "title": "...", "text": "..." },
//   "case_id": { "title": "...", "text": "...", "files": ["0003.jpg", ...] }
// }
async function loadCases() {
  const url = MEDIA_BASE_URL + "cases.json";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- URL PARAMETERS ---
const params = new URLSearchParams(window.location.search);
const tagFromURL = params.get("tag");
const mediaFromURL = params.get("media");

// Shuffle
function extractNumber(filename) {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildMediaItems(casesMap) {
  const items = Object.keys(casesMap).map(filename => ({
    filename,
    url: MEDIA_BASE_URL + filename,
    tags: Array.isArray(casesMap[filename]?.tags)
      ? casesMap[filename].tags
      : [],
  }));

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}


// Tag stats
function buildTagStats(mediaItems) {
  const tagCounts = {};
  mediaItems.forEach(item => {
    item.tags.forEach(tag => {
      if (!tagCounts[tag]) tagCounts[tag] = 0;
      tagCounts[tag]++;
    });
  });

  const total = mediaItems.length;
  const tags = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { total, tags };
}

// Render filters
function renderFilters(container, tagStats, onFilterChange) {
  container.innerHTML = "";

  const makeBtn = (label, count, options = {}) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";

    if (options.all) btn.classList.add("filter-btn--all");
    else {
      btn.classList.add("filter-btn--color");
      btn.dataset.colorIndex = String(options.colorIndex);
    }

    btn.dataset.filter = options.value;
    btn.innerHTML = `#${label} <span class="count">(${count})</span>`;
    btn.addEventListener("click", () => onFilterChange(options.value));

    return btn;
  };

  container.appendChild(makeBtn("Все", tagStats.total, { all: true, value: "__all" }));

  tagStats.tags.forEach((tag, idx) => {
    container.appendChild(
      makeBtn(tag.name, tag.count, {
        value: tag.name,
        colorIndex: idx % 7
      })
    );
  });
}

function setActiveFilterButton(container, activeValue) {
  container.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("filter-btn--active", btn.dataset.filter === activeValue);
  });
}

/* ==========================================
   PINTEREST MASONRY ENGINE (Safari iOS safe)
========================================== */

function getColumnCount() {
  const w = window.innerWidth;
  if (w <= 640) return 2;      // mobile
  if (w <= 1024) return 3;     // tablet
  if (w <= 1280) return 4;     // small desktop
  if (w <= 1536) return 5;     // desktop+
  return 6;                    // wide
}

function getGap(gridEl) {
  const styles = getComputedStyle(gridEl);
  const gap = parseFloat(styles.getPropertyValue("--grid-gap"));
  return Number.isFinite(gap) ? gap : 12;
}

let layoutRaf = 0;
function scheduleLayout(gridEl) {
  if (!gridEl) return;
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => layoutMasonry(gridEl));
}


let lastGridHeight = 0;
let stableLayouts = 0;
const STABLE_LAYOUTS_REQUIRED = 2;

function layoutMasonry(gridEl) {
  if (!gridEl) return;

  const cards = Array.from(gridEl.querySelectorAll(".card"));
  if (!cards.length) {
    gridEl.style.height = "0px";
    return;
  }

  const gap = getGap(gridEl);
  const cols = getColumnCount();

  const rect = gridEl.getBoundingClientRect();
  const styles = getComputedStyle(gridEl);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;

  const innerWidth = Math.max(0, Math.floor(rect.width - padL - padR));
  const colWidth = Math.max(120, Math.floor((innerWidth - gap * (cols - 1)) / cols));

  const colHeights = new Array(cols).fill(0);

  for (const card of cards) {
    card.style.width = `${colWidth}px`;

    // важный момент: меряем после установки width
    const h = Math.ceil(card.getBoundingClientRect().height);

    // выбираем самую короткую колонку (Pinterest)
    let target = 0;
    for (let i = 1; i < cols; i++) {
      if (colHeights[i] < colHeights[target]) target = i;
    }

    const x = (colWidth + gap) * target;
    const y = colHeights[target];

    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    card.classList.add("is-measured");

    colHeights[target] = y + h + gap;
  }

  const height = Math.max(...colHeights) - gap;
  gridEl.style.height = `${Math.max(0, Math.ceil(height))}px`;
  const currentHeight = gridEl.offsetHeight;

  if (Math.abs(currentHeight - lastGridHeight) < 2) {
    stableLayouts++;
  } else {
    stableLayouts = 0;
  }

  lastGridHeight = currentHeight;

  if (stableLayouts >= STABLE_LAYOUTS_REQUIRED) {
    document.getElementById("intro-screen")?.classList.add("hidden");
  }

}

function bindMasonryObservers(gridEl) {
  if (!gridEl) return;

  // ResizeObserver: пересчёт при изменениях размеров карточек (видео/шрифты/ленивые картинки)
  const ro = new ResizeObserver(() => scheduleLayout(gridEl));
  ro.observe(gridEl);


  // Resize окна
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scheduleLayout(gridEl), 80);
  }, { passive: true });

  return { ro };
}

/* =========================
   Render grid (masonry)
========================= */

function renderGrid(container, mediaItems, activeFilter, onMediaRendered) {
  container.innerHTML = "";

  const filtered = activeFilter === "__all"
    ? mediaItems
    : mediaItems.filter(item => item.tags.includes(activeFilter));

  const createdMedia = [];

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    // единая оболочка для анимации (и для img, и для video)
    const inner = document.createElement("div");
    inner.className = "card-inner";

    let mediaEl;

    if (/\.(mp4|webm)$/i.test(item.filename)) {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.load();
      inner.appendChild(video);
      mediaEl = video;
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.loading = "lazy";
      img.alt = "";
      inner.appendChild(img);
      mediaEl = img;
    }

    card.appendChild(inner);

    card.addEventListener("click", () => openCasebox(item, mediaItems));
    container.appendChild(card);
    createdMedia.push(mediaEl);

    // Когда медиа готово — пересчитать раскладку
    const kick = () => scheduleLayout(container);

    if (mediaEl.tagName === "IMG") {
      if (mediaEl.complete) kick();
      // decode помогает Safari/Chrome, но не обязателен
      mediaEl.addEventListener("load", kick, { once: true });
    } else {
      if (mediaEl.readyState >= 2) kick();
      mediaEl.addEventListener("loadedmetadata", kick, { once: true });
      
    }


  });

  // первичный layout сразу
  scheduleLayout(container);

  if (typeof onMediaRendered === "function") {
    onMediaRendered(createdMedia);
  }
}

/* =========================
   Casebox (project view)
========================= */

const casebox = document.getElementById("casebox");
const caseboxOverlay = document.getElementById("casebox-overlay");
const caseboxBackTop = document.getElementById("casebox-back-top");
const caseboxIndex = document.getElementById("casebox-index");
const caseboxBackBottom = document.getElementById("casebox-back-bottom");
const caseboxImg = document.getElementById("casebox-img");
const caseboxVideo = document.getElementById("casebox-video");
const caseboxLoader = document.getElementById("casebox-loader");

function showCaseLoader() {
  caseboxLoader?.classList.remove("hidden");
}

function hideCaseLoader() {
  caseboxLoader?.classList.add("hidden");
}

const caseboxTags = document.getElementById("casebox-tags");
const caseboxText = document.getElementById("casebox-text");
const recoGrid = document.getElementById("reco-grid");
const introScreen = document.getElementById("intro-screen");

let CASES_DB = null;
let lastScrollY = 0;
let activeCaseItem = null;
let activeMediaItems = [];

function lockScroll() {
  lastScrollY = window.scrollY || 0;
  document.body.classList.add("modal-open");
  document.body.style.top = `-${lastScrollY}px`;
}

function unlockScroll() {
  document.body.classList.remove("modal-open");
  const top = document.body.style.top;
  document.body.style.top = "";
  const y = top ? Math.abs(parseInt(top, 10)) : lastScrollY;
  window.scrollTo(0, y);

}

function normalizeFilename(srcOrName) {
  // accepts full url or filename
  try {
    if (/^https?:/i.test(srcOrName)) return new URL(srcOrName).pathname.split("/").pop();
  } catch {}
  return String(srcOrName || "").split("/").pop();
}

function getCaseMetaForItem(item) {
  const fn = item?.filename;
  if (!CASES_DB || !fn) {
    return { description: "" };
  }

  const v = CASES_DB[fn];
  if (v && typeof v === "object") {
    return {
      description: (v.description || v.text || "").trim()
    };
  }

  return { description: "" };
}


function renderCaseTags(tags, allItems) {
  caseboxTags.innerHTML = "";
  (tags || []).forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "casebox__tag";
    b.textContent = `#${t}`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      closeCasebox();
      // применяем фильтр по тегу
      window.history.replaceState(null, "", `?tag=${encodeURIComponent(t)}`);
      // триггерим клик по фильтру, если существует
      const btn = document.querySelector(`.filter-btn[data-filter="${CSS.escape(t)}"]`);
      btn?.click();
    });
    caseboxTags.appendChild(b);
  });
}

function pickRecommendations(current, allItems, max = 18) {
  const currentTags = new Set(current.tags || []);
  if (!currentTags.size) return [];

  // только работы с пересечением тегов
  const related = allItems
    .filter(it => it.filename !== current.filename)
    .map(it => {
      const commonCount = (it.tags || []).filter(t => currentTags.has(t)).length;
      return { item: it, commonCount };
    })
    .filter(x => x.commonCount > 0);

  // сортируем по количеству общих тегов (чем больше — тем выше)
  related.sort((a, b) => b.commonCount - a.commonCount);

  return related.slice(0, max).map(x => x.item);
}


function renderRecoGrid(recoItems) {
  if (!recoGrid) return;
  recoGrid.innerHTML = "";

  const createdMedia = [];

  recoItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    const inner = document.createElement("div");
    inner.className = "card-inner";

    let mediaEl;
    if (/\.(mp4|webm)$/i.test(item.filename)) {
      const v = document.createElement("video");
      v.src = item.url;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      v.preload = "metadata";
      inner.appendChild(v);
      mediaEl = v;
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.loading = "lazy";
      img.alt = "";
      inner.appendChild(img);
      mediaEl = img;
    }

    card.appendChild(inner);
    card.addEventListener("click", () => openCasebox(item, activeMediaItems));
    recoGrid.appendChild(card);
    createdMedia.push(mediaEl);

    const kick = () => scheduleLayout(recoGrid);
    if (mediaEl.tagName === "IMG") {
      if (mediaEl.complete) kick();
      
      mediaEl.addEventListener("load", kick, { once: true });
    } else {
      if (mediaEl.readyState >= 2) kick();
      mediaEl.addEventListener("loadedmetadata", kick, { once: true });
    }

    requestAnimationFrame(() => {
      const delay = 0.05 + Math.random() * 0.35;
      card.style.animationDelay = `${delay}s`;
      card.classList.add("anim-start");
    });
  });

  // первичный layout
  scheduleLayout(recoGrid);
}

function adjustCaseMediaScroll(mediaEl) {
  const mediaBox = document.querySelector(".casebox__media");
  if (!mediaBox || !mediaEl) return;

  const h = mediaEl.naturalHeight || mediaEl.videoHeight || 0;
  const w = mediaEl.naturalWidth || mediaEl.videoWidth || 1;

  if (!h || !w) return;

  const ratio = w / h; // ВАЖНО: width / height

  /*
    Правило:
    - ratio < 0.5  → очень длинный вертикальный (сайт)
      → тянем по ширине + ВКЛЮЧАЕМ скролл
    - ratio >= 0.5 → обычные форматы
      → ВЛЕЗАЮТ В ЭКРАН, СКРОЛЛА НЕТ
  */

  if (ratio < 0.5) {
    // длинный сайт
    mediaBox.style.overflowY = "auto";
    mediaBox.style.overflowX = "hidden";
    mediaBox.style.alignItems = "flex-start";

    mediaEl.style.maxWidth = "100%";
    mediaEl.style.maxHeight = "none";
  } else {
    // обычные форматы
    mediaBox.style.overflow = "hidden";
    mediaBox.style.alignItems = "center";

    mediaEl.style.maxWidth = "100%";
    mediaEl.style.maxHeight = "78vh";

    mediaBox.scrollTop = 0;
  }
}



function openCasebox(item, allItems) {
  if (!casebox) return;
    // гарантируем корректное повторное открытие
  casebox.classList.add("hidden");
  casebox.setAttribute("aria-hidden", "true");

  activeCaseItem = item;
  activeMediaItems = Array.isArray(allItems) ? allItems : [];

    const src = item.url;
  const isVideo = /\.(mp4|webm)$/i.test(item.filename);

  // reset loader state every open
  showCaseLoader();

  // сбрасываем старые хэндлеры (важно для iOS)
  caseboxImg.onload = null;
  caseboxImg.onerror = null;
  caseboxVideo.onloadedmetadata = null;
  caseboxVideo.onloadeddata = null;
  caseboxVideo.onerror = null;

  if (isVideo) {
    caseboxImg.style.display = "none";
    caseboxVideo.style.display = "block";

    caseboxVideo.pause();
    caseboxVideo.removeAttribute("src"); // жесткий сброс
    caseboxVideo.load();

    caseboxVideo.src = src;
    caseboxVideo.load();

    const onReady = () => {
      hideCaseLoader();
      adjustCaseMediaScroll(caseboxVideo);
    };

    caseboxVideo.onloadedmetadata = onReady;
    caseboxVideo.onloadeddata = onReady;
    caseboxVideo.onerror = () => hideCaseLoader();

    // play после установки src (клик пользователя = user gesture)
    caseboxVideo.play().catch(() => {
      // даже если play не дали — лоадер убираем после metadata
    });

  } else {
    caseboxVideo.pause();
    caseboxVideo.style.display = "none";
    caseboxVideo.removeAttribute("src");
    caseboxVideo.load();

    caseboxImg.style.display = "block";
    caseboxImg.src = src;

    caseboxImg.onload = () => {
      hideCaseLoader();
      adjustCaseMediaScroll(caseboxImg);
    };
    caseboxImg.onerror = () => hideCaseLoader();
  }


  // tags + meta
  renderCaseTags(item.tags || [], allItems);
  const meta = getCaseMetaForItem(item);

if (meta.description) {
  caseboxText.textContent = meta.description;
  caseboxText.style.display = "block";
} else {
  caseboxText.textContent = "";
  caseboxText.style.display = "none";
}



  // recommendations (18 минимум)
  const reco = pickRecommendations(item, allItems, 18);
  renderRecoGrid(reco);

  // открыть
  casebox.classList.remove("hidden");
  casebox.setAttribute("aria-hidden", "false");
  lockScroll();
  // Всегда открываем кейс с самого верха
  requestAnimationFrame(() => {
  const body = document.querySelector(".casebox__body");
  if (body) body.scrollTop = 0;
  });


  // URL (для шаринга)
  const fn = item.filename;
  if (caseboxIndex) {
    const num = fn.match(/^0*(\d+)/)?.[1];
    caseboxIndex.textContent = num ? `№ ${num}` : "";
  }
  const url = new URL(window.location.href);
  url.searchParams.set("media", fn);
  window.history.replaceState(null, "", url.toString());

  // подстраховка: после загрузки медиа пересчитать reco
  setTimeout(() => scheduleLayout(recoGrid), 220);
}

function closeCasebox() {
  if (!casebox) return;
  casebox.classList.add("hidden");
  casebox.setAttribute("aria-hidden", "true");

  // cleanup
  caseboxImg.src = "";
  caseboxVideo.pause();
  caseboxVideo.src = "";
  recoGrid.innerHTML = "";
  activeCaseItem = null;
  if (caseboxIndex) caseboxIndex.textContent = "";


  unlockScroll();

  // очистить ?media=, но оставить ?tag= если есть
  const url = new URL(window.location.href);
  url.searchParams.delete("media");
  window.history.replaceState(null, "", url.toString());
}

[caseboxOverlay, caseboxBackTop, caseboxBackBottom].forEach(el =>
  el?.addEventListener("click", closeCasebox)
);


// закрытие по ESC
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && casebox && !casebox.classList.contains("hidden")) {
    closeCasebox();
  }
});

/* =========================
   Intro helpers
========================= */

function hideIntroScreen() {
  if (introScreen) {
    introScreen.classList.add("hidden");
  }
}

function waitForMediaBatch(mediaElements, batchSize = 8) {
  const targets = mediaElements.slice(0, batchSize);

  return Promise.all(targets.map(el => new Promise(resolve => {
    if (el.tagName === "IMG" && el.complete) return resolve();
    if (el.tagName === "VIDEO" && el.readyState >= 2) return resolve();

    el.addEventListener("load", resolve, { once: true });
    el.addEventListener("loadeddata", resolve, { once: true });
    el.addEventListener("loadedmetadata", resolve, { once: true });
  })));
}
// Быстрый прогрев: загружаем метаданные/превью первых N медиа,
// чтобы после интро карточки и модалка открывались без тормозов.
function warmupMedia(mediaItems, count = 12, timeoutMs = 3500) {
  const shortlist = mediaItems.slice(0, count);

  const loaders = shortlist.map(item => new Promise(resolve => {
    const isVideo = /\.(mp4|webm)$/i.test(item.filename);

    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;

      const done = () => {
        v.removeAttribute("src");
        v.load();
        resolve();
      };

      v.addEventListener("loadedmetadata", done, { once: true });
      v.addEventListener("error", done, { once: true });
      v.src = item.url;
    } else {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";

      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      img.src = item.url;
    }
  }));

  const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.allSettled(loaders), timeout]);
}

/* =========================
   Init
========================= */

(async function init() {
  const filtersEl = document.getElementById("filters");
  const gridEl = document.getElementById("grid");

  let mediaItems = [];
  let activeFilter = "__all";
  let introHidden = false;
  let warmupPromise = Promise.resolve();


  // Masonry observers (1 раз)
  const masonry = bindMasonryObservers(gridEl);

    try {
    const casesMap = await loadTags(); // tags.json = cases
    CASES_DB = casesMap;
    mediaItems = buildMediaItems(casesMap);
    warmupPromise = warmupMedia(mediaItems, 14);

    const tagStats = buildTagStats(mediaItems);

    // --- APPLY ?tag= FILTER ---
    if (tagFromURL && tagStats.tags.some(t => t.name === tagFromURL)) {
      activeFilter = tagFromURL;
    }

    const hideIntroOnce = () => {
      if (introHidden) return;
      introHidden = true;
      hideIntroScreen();
    };

    const onFilterChange = (value) => {
      activeFilter = value;
      setActiveFilterButton(filtersEl, activeFilter);

      // --- URL sync (tag / all / clean) ---
      let basePath = window.location.pathname;
      if (!basePath.endsWith("/") && !basePath.endsWith(".html")) basePath = "/";
      const url = new URL(window.location.origin + basePath);

      if (value === "__all") {
        // чистый URL
        url.searchParams.delete("tag");
        url.searchParams.delete("media");
      } else {
        url.searchParams.set("tag", value);
        url.searchParams.delete("media");
      }

      window.history.replaceState(null, "", url.toString());


      renderGrid(gridEl, mediaItems, activeFilter, (mediaNodes) => {

        scheduleLayout(gridEl);
        // интро уже может быть скрыто, но логика остаётся безопасной
        Promise.all([warmupPromise, waitForMediaBatch(mediaNodes)])
          .then(hideIntroOnce);
      });
    };

    // --- APPLY ?media= OPEN CASE ---
    if (mediaFromURL) {
      const fn = normalizeFilename(mediaFromURL);
      const found = mediaItems.find(m => m.filename === fn);
      if (found) {
        setTimeout(() => openCasebox(found, mediaItems), 450);
      }
    }

    renderFilters(filtersEl, tagStats, onFilterChange);
    setActiveFilterButton(filtersEl, activeFilter);

    renderGrid(gridEl, mediaItems, activeFilter, (mediaNodes) => {

      scheduleLayout(gridEl);
      Promise.all([warmupPromise, waitForMediaBatch(mediaNodes)])
        .then(hideIntroOnce);
    });

    // фолбэк на случай медленного интернета
    setTimeout(hideIntroOnce, 4800);

  } catch (e) {
    console.error(e);
    hideIntroScreen();
  }

  document.getElementById("logo-link").addEventListener("click", (e) => {
    e.preventDefault();

    // сброс фильтра
    activeFilter = "__all";
    setActiveFilterButton(filtersEl, activeFilter);

    // закрыть кейс, если открыт
    closeCasebox();

    // чистый URL
    let basePath = window.location.pathname;
    if (!basePath.endsWith("/") && !basePath.endsWith(".html")) basePath = "/";
    const url = new URL(window.location.origin + basePath);
    url.searchParams.delete("tag");
    url.searchParams.delete("media");
    window.history.replaceState(null, "", url.toString());

    // вверх
    window.scrollTo({ top: 0, behavior: "smooth" });

    // перерисовка сетки
    renderGrid(gridEl, mediaItems, activeFilter, (mediaNodes) => {
      scheduleLayout(gridEl);
    });
  });

// ==== Скролл-анимация хедера ====
  let lastScroll = 0;
  const header = document.querySelector(".header-blur");

  window.addEventListener("scroll", () => {
    const current = window.scrollY;

    if (current > lastScroll && current > 80) {
      header.classList.add("header-hidden");
    } else {
      header.classList.remove("header-hidden");
    }

    lastScroll = current;
  }, { passive: true });

})();
