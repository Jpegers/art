/*
  media.js
  - Casebox (project modal)
  - Recommendations grid inside modal

  ES module. Responsibility: modal + media loading.
*/

let CASES_DB = null;
let scheduleLayoutFn = () => {};

export function setCasesDb(db) {
  CASES_DB = db;
}

export function setScheduleLayout(fn) {
  scheduleLayoutFn = typeof fn === "function" ? fn : (() => {});
}

// DOM
const casebox = document.getElementById("casebox");
const caseboxOverlay = document.getElementById("casebox-overlay");
const caseboxBackTop = document.getElementById("casebox-back-top");
const caseboxIndex = document.getElementById("casebox-index");
const caseboxBackBottom = document.getElementById("casebox-back-bottom");
const caseboxImg = document.getElementById("casebox-img");
const caseboxVideo = document.getElementById("casebox-video");
const caseboxLoader = document.getElementById("casebox-loader");
const caseboxTags = document.getElementById("casebox-tags");
const caseboxText = document.getElementById("casebox-text");
const recoGrid = document.getElementById("reco-grid");

let lastScrollY = 0;
let activeCaseItem = null;
let activeMediaItems = [];

function showCaseLoader() {
  caseboxLoader?.classList.remove("hidden");
}

function hideCaseLoader() {
  caseboxLoader?.classList.add("hidden");
}

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

export function normalizeFilename(srcOrName) {
  // accepts full url or filename
  try {
    if (/^https?:/i.test(srcOrName)) return new URL(srcOrName).pathname.split("/").pop();
  } catch {}
  return String(srcOrName || "").split("/").pop();
}

function getCaseMetaForItem(item) {
  const fn = item?.filename;
  if (!CASES_DB || !fn) return { description: "" };

  const v = CASES_DB[fn];
  if (v && typeof v === "object") {
    return { description: (v.description || v.text || "").trim() };
  }

  return { description: "" };
}

function renderCaseTags(tags, allItems) {
  if (!caseboxTags) return;
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
      const btn = document.querySelector(`.filter-btn[data-filter="${CSS.escape(t)}"]`);
      btn?.click();
    });
    caseboxTags.appendChild(b);
  });
}

function pickRecommendations(current, allItems, max = 18) {
  const currentTags = new Set(current.tags || []);
  if (!currentTags.size) return [];

  const related = allItems
    .filter(it => it.filename !== current.filename)
    .map(it => {
      const commonCount = (it.tags || []).filter(t => currentTags.has(t)).length;
      return { item: it, commonCount };
    })
    .filter(x => x.commonCount > 0);

  related.sort((a, b) => b.commonCount - a.commonCount);
  return related.slice(0, max).map(x => x.item);
}

function renderRecoGrid(recoItems) {
  if (!recoGrid) return;
  recoGrid.innerHTML = "";

  recoItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    const inner = document.createElement("div");
    inner.className = "card-inner";

    let mediaEl;
    if (/(\.mp4|\.webm)$/i.test(item.filename)) {
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

    const kick = () => scheduleLayoutFn(recoGrid);
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

  scheduleLayoutFn(recoGrid);
}

function adjustCaseMediaScroll(mediaEl) {
  const mediaBox = document.querySelector(".casebox__media");
  if (!mediaBox || !mediaEl) return;

  const h = mediaEl.naturalHeight || mediaEl.videoHeight || 0;
  const w = mediaEl.naturalWidth || mediaEl.videoWidth || 1;
  if (!h || !w) return;

  const ratio = w / h; // width / height

  if (ratio < 0.5) {
    mediaBox.style.overflowY = "auto";
    mediaBox.style.overflowX = "hidden";
    mediaBox.style.alignItems = "flex-start";

    mediaEl.style.maxWidth = "100%";
    mediaEl.style.maxHeight = "none";
  } else {
    mediaBox.style.overflow = "hidden";
    mediaBox.style.alignItems = "center";

    mediaEl.style.maxWidth = "100%";
    mediaEl.style.maxHeight = "78vh";

    mediaBox.scrollTop = 0;
  }
}

export function openCasebox(item, allItems) {
  if (!casebox) return;

  // гарантируем корректное повторное открытие
  casebox.classList.add("hidden");
  casebox.setAttribute("aria-hidden", "true");

  activeCaseItem = item;
  activeMediaItems = Array.isArray(allItems) ? allItems : [];

  const src = item.url;
  const isVideo = /(\.mp4|\.webm)$/i.test(item.filename);

  showCaseLoader();

  // сбрасываем старые хэндлеры (важно для iOS)
  if (caseboxImg) {
    caseboxImg.onload = null;
    caseboxImg.onerror = null;
  }
  if (caseboxVideo) {
    caseboxVideo.onloadedmetadata = null;
    caseboxVideo.onloadeddata = null;
    caseboxVideo.onerror = null;
  }

  if (isVideo) {
    caseboxImg.style.display = "none";
    caseboxVideo.style.display = "block";

    caseboxVideo.pause();
    caseboxVideo.removeAttribute("src");
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

    caseboxVideo.play().catch(() => {});
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

  if (caseboxText) {
    if (meta.description) {
      caseboxText.textContent = meta.description;
      caseboxText.style.display = "block";
    } else {
      caseboxText.textContent = "";
      caseboxText.style.display = "none";
    }
  }

  const reco = pickRecommendations(item, allItems, 18);
  renderRecoGrid(reco);

  casebox.classList.remove("hidden");
  casebox.setAttribute("aria-hidden", "false");
  lockScroll();

  // всегда с самого верха
  requestAnimationFrame(() => {
    const body = document.querySelector(".casebox__body");
    if (body) body.scrollTop = 0;
  });

  // URL для шаринга
  const fn = item.filename;
  if (caseboxIndex) {
    const num = fn.match(/^0*(\d+)/)?.[1];
    caseboxIndex.textContent = num ? `№ ${num}` : "";
  }
  const url = new URL(window.location.href);
  url.searchParams.set("media", fn);
  window.history.replaceState(null, "", url.toString());

  setTimeout(() => scheduleLayoutFn(recoGrid), 220);
}

export function closeCasebox() {
  if (!casebox) return;
  casebox.classList.add("hidden");
  casebox.setAttribute("aria-hidden", "true");

  // cleanup
  if (caseboxImg) caseboxImg.src = "";
  if (caseboxVideo) {
    caseboxVideo.pause();
    caseboxVideo.src = "";
  }
  if (recoGrid) recoGrid.innerHTML = "";
  activeCaseItem = null;
  if (caseboxIndex) caseboxIndex.textContent = "";

  unlockScroll();

  // очистить ?media=, но оставить ?tag= если есть
  const url = new URL(window.location.href);
  url.searchParams.delete("media");
  window.history.replaceState(null, "", url.toString());
}

export function initMedia() {
  // закрытие по клику на оверлей/кнопки
  [caseboxOverlay, caseboxBackTop, caseboxBackBottom].forEach(el =>
    el?.addEventListener("click", closeCasebox)
  );

  // закрытие по ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && casebox && !casebox.classList.contains("hidden")) {
      closeCasebox();
    }
  });
}
