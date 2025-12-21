/*
  grid.js
  - Pinterest-style masonry layout (Safari/iOS safe)
  - Grid rendering (cards + media nodes)

  ES module. Responsibility: layout + grid DOM only.
*/

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
export function scheduleLayout(gridEl) {
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

export function bindMasonryObservers(gridEl) {
  if (!gridEl) return;

  // ResizeObserver: пересчёт при изменениях размеров карточек (видео/шрифты/ленивые картинки)
  const ro = new ResizeObserver(() => scheduleLayout(gridEl));
  ro.observe(gridEl);

  // Resize окна
  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => scheduleLayout(gridEl), 80);
    },
    { passive: true }
  );

  return { ro };
}

export function renderGrid(container, mediaItems, activeFilter, { onOpenCase, onMediaRendered } = {}) {
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

    card.addEventListener("click", () => {
      if (typeof onOpenCase === "function") onOpenCase(item, mediaItems);
    });

    container.appendChild(card);
    createdMedia.push(mediaEl);

    // Когда медиа готово — пересчитать раскладку
    const kick = () => scheduleLayout(container);

    if (mediaEl.tagName === "IMG") {
      if (mediaEl.complete) kick();
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
