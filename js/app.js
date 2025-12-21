/*
  app.js (entry)
  - Data loading
  - Filters
  - Bootstraps grid + modal

  This replaces legacy /js/main.js.
*/

import { bindMasonryObservers, renderGrid, scheduleLayout } from "./grid.js";
import { initMedia, openCasebox, closeCasebox, normalizeFilename, setCasesDb, setScheduleLayout } from "./media.js";

// Всегда начинаем страницу с верха
window.history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ==== CONFIG ====
const MEDIA_BASE_URL = "https://pub-3bc4f2b4686e4f2da3620e629a5a1aae.r2.dev/";

// Load tags.json
async function loadTags() {
  const res = await fetch(`${MEDIA_BASE_URL}tags.json`);
  if (!res.ok) throw new Error("Не удалось загрузить tags.json");
  return res.json();
}

// Load optional cases.json (descriptions). Safe fallback.
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

function buildMediaItems(casesMap) {
  const items = Object.keys(casesMap).map(filename => ({
    filename,
    url: MEDIA_BASE_URL + filename,
    tags: Array.isArray(casesMap[filename]?.tags) ? casesMap[filename].tags : [],
  }));

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

function buildTagStats(mediaItems) {
  const tagCounts = {};
  mediaItems.forEach(item => {
    (item.tags || []).forEach(tag => {
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
        colorIndex: idx % 7,
      })
    );
  });
}

function setActiveFilterButton(container, activeValue) {
  container.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("filter-btn--active", btn.dataset.filter === activeValue);
  });
}

/* =========================
   Intro helpers
========================= */

const introScreen = document.getElementById("intro-screen");

function hideIntroScreen() {
  introScreen?.classList.add("hidden");
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

// Быстрый прогрев: загружаем метаданные/превью первых N медиа
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
  const gridEl = document.getElementById("grid");
  const filtersEl = document.getElementById("filters");

  if (!gridEl || !filtersEl) return;

  // Masonry observers once
  bindMasonryObservers(gridEl);

  // Modal init
  setScheduleLayout(scheduleLayout);
  initMedia();

  let mediaItems = [];
  let activeFilter = "__all";
  let warmupPromise = Promise.resolve();
  let introHidden = false;

  try {
    const casesMap = await loadTags(); // tags.json = cases
    const casesDb = await loadCases();
    setCasesDb(casesDb);

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
        url.searchParams.delete("tag");
        url.searchParams.delete("media");
      } else {
        url.searchParams.set("tag", value);
        url.searchParams.delete("media");
      }

      window.history.replaceState(null, "", url.toString());

      renderGrid(gridEl, mediaItems, activeFilter, {
        onOpenCase: openCasebox,
        onMediaRendered: (mediaNodes) => {
          scheduleLayout(gridEl);
          Promise.all([warmupPromise, waitForMediaBatch(mediaNodes)])
            .then(hideIntroOnce);
        },
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

    renderGrid(gridEl, mediaItems, activeFilter, {
      onOpenCase: openCasebox,
      onMediaRendered: (mediaNodes) => {
        scheduleLayout(gridEl);
        Promise.all([warmupPromise, waitForMediaBatch(mediaNodes)])
          .then(hideIntroOnce);
      },
    });

    // фолбэк на случай медленного интернета
    setTimeout(hideIntroOnce, 4800);

  } catch (e) {
    console.error(e);
    hideIntroScreen();
  }

  // reset filter by logo
  const logoLink = document.getElementById("logo-link");
  logoLink?.addEventListener("click", (e) => {
    e.preventDefault();

    activeFilter = "__all";
    setActiveFilterButton(filtersEl, activeFilter);

    closeCasebox();

    let basePath = window.location.pathname;
    if (!basePath.endsWith("/") && !basePath.endsWith(".html")) basePath = "/";
    const url = new URL(window.location.origin + basePath);
    url.searchParams.delete("tag");
    url.searchParams.delete("media");
    window.history.replaceState(null, "", url.toString());

    window.scrollTo({ top: 0, behavior: "smooth" });

    renderGrid(gridEl, mediaItems, activeFilter, {
      onOpenCase: openCasebox,
      onMediaRendered: () => scheduleLayout(gridEl),
    });
  });

  // ==== Скролл-анимация хедера ====
  let lastScroll = 0;
  const header = document.querySelector(".header-blur");

  window.addEventListener("scroll", () => {
    const current = window.scrollY;

    if (current > lastScroll && current > 80) {
      header?.classList.add("header-hidden");
    } else {
      header?.classList.remove("header-hidden");
    }

    lastScroll = current;
  }, { passive: true });
})();
