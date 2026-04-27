const canvas = document.getElementById('result');
const ctx = canvas.getContext('2d');

const MIN_FONT_RATIO = 0.6;
const FONT_HEIGHT_RATIO = 0.75;
const BLUR_RATIO = 0.15;
const ERASE_PAD = 2;

window.api.onShowTranslation((data) => {
  const { screenshotPath, blocks } = data;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const clean = document.createElement('canvas');
    clean.width = img.width;
    clean.height = img.height;
    clean.getContext('2d').drawImage(img, 0, 0);

    const scaleX = img.width / window.innerWidth;
    const scaleY = img.height / window.innerHeight;

    // Pre-compute pixel-space coords + cluster blocks into rows for font normalization
    const px = blocks.map(b => ({
      block: b,
      x: Math.round(b.x * scaleX),
      y: Math.round(b.y * scaleY),
      w: Math.round(b.width * scaleX),
      h: Math.round(b.height * scaleY),
    }));
    const rowMetrics = clusterRowsAndGetHeights(px);

    px.forEach((p, i) => {
      const { block, x, y, w, h } = p;
      // Use the row's representative height for font sizing — same row → same font size
      const { rowH, rowCenter } = rowMetrics[i];

      const isBold = rowH > 44;
      const weight = isBold ? 'bold' : 'normal';
      const fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';
      const originalFontSize = Math.round(rowH * FONT_HEIGHT_RATIO);

      const minFontSize = Math.max(10, Math.floor(originalFontSize * MIN_FONT_RATIO));
      let fontSize = originalFontSize;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (fontSize > minFontSize && ctx.measureText(block.translated).width > w) {
        fontSize--;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      }

      // Erase original text with sampled background color
      const cleanCtx = clean.getContext('2d');
      const bgColor = sampleEdgeColor(cleanCtx, x, y, w, h);
      ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
      ctx.fillRect(x - ERASE_PAD, y - ERASE_PAD, w + ERASE_PAD * 2, h + ERASE_PAD * 2);

      // Draw translated text
      const textColor = bgColor.brightness > 128
        ? (bgColor.brightness > 200 ? '#1a1a1a' : '#000000')
        : (bgColor.brightness < 50 ? '#e0e0e0' : '#ffffff');
      ctx.fillStyle = textColor;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'middle';

      // Use row-shared center Y so same-row blocks render text at the same vertical position
      ctx.fillText(block.translated, x, rowCenter, w);
    });
  };

  img.src = data.screenshotDataUrl || `file://${screenshotPath}`;
});

// Edge-aware window drag + resize + double-click dismiss
const EDGE = 10;
function getEdgeMode(e) {
  const w = window.innerWidth, h = window.innerHeight;
  const n = e.clientY < EDGE, s = e.clientY > h - EDGE;
  const we = e.clientX < EDGE, ea = e.clientX > w - EDGE;
  return (n ? 'n' : '') + (s ? 's' : '') + (we ? 'w' : '') + (ea ? 'e' : '');
}
function modeToCursor(m) {
  if (m === 'nw' || m === 'se') return 'nwse-resize';
  if (m === 'ne' || m === 'sw') return 'nesw-resize';
  if (m === 'n' || m === 's') return 'ns-resize';
  if (m === 'e' || m === 'w') return 'ew-resize';
  return 'move';
}

let drag = null;
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.screenX, y: e.screenY, mode: getEdgeMode(e) };
});
document.addEventListener('mousemove', (e) => {
  if (drag) {
    const dx = e.screenX - drag.x;
    const dy = e.screenY - drag.y;
    if (dx === 0 && dy === 0) return;
    if (drag.mode === '') {
      window.api.moveBy(dx, dy);
    } else {
      window.api.resizeEdge(drag.mode, dx, dy);
    }
    drag.x = e.screenX;
    drag.y = e.screenY;
  } else {
    document.body.style.cursor = modeToCursor(getEdgeMode(e));
  }
});
document.addEventListener('mouseup', () => { drag = null; });
document.addEventListener('dblclick', () => {
  window.api.dismiss();
});

// Pinch-to-zoom: macOS trackpad pinch arrives as wheel event with ctrlKey
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  window.api.resizeBy(-e.deltaY);
}, { passive: false });

window.api.onClear(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function detectOriginalFontSize(originalText, boxWidth, boxHeight, weight, fontFamily) {
  return Math.round(boxHeight * FONT_HEIGHT_RATIO);
}

// Cluster blocks into rows by vertical-center alignment.
// Returns per-block { rowH, rowCenter } so same-row blocks share font size AND vertical center.
// rowH = max h in row (best approximates actual font size; shorter boxes lack descenders)
// rowCenter = mean center y of row (avoids vertical jitter between blocks with different h)
function clusterRowsAndGetHeights(items) {
  if (items.length === 0) return [];
  const sorted = items.map((it, idx) => ({ it, idx, center: it.y + it.h / 2 }))
                       .sort((a, b) => a.center - b.center);
  const result = new Array(items.length);
  let i = 0;
  while (i < sorted.length) {
    const startCenter = sorted[i].center;
    const startH = sorted[i].it.h;
    const tolerance = startH * 0.4;
    let j = i;
    let maxH = startH;
    let centerSum = 0;
    while (j < sorted.length && sorted[j].center - startCenter < tolerance) {
      maxH = Math.max(maxH, sorted[j].it.h);
      centerSum += sorted[j].center;
      j++;
    }
    const rowCenter = centerSum / (j - i);
    for (let k = i; k < j; k++) result[sorted[k].idx] = { rowH: maxH, rowCenter };
    i = j;
  }
  return result;
}

function sampleEdgeColor(cleanCtx, x, y, w, h) {
  const m = 4;
  const points = [
    [x - m, y], [x - m, y + h/2], [x - m, y + h],
    [x + w + m, y], [x + w + m, y + h/2], [x + w + m, y + h],
    [x, y - m], [x + w/2, y - m], [x + w, y - m],
    [x, y + h + m], [x + w/2, y + h + m], [x + w, y + h + m],
  ];
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (const [px, py] of points) {
    const cx = Math.max(0, Math.min(Math.round(px), canvas.width - 1));
    const cy = Math.max(0, Math.min(Math.round(py), canvas.height - 1));
    const p = cleanCtx.getImageData(cx, cy, 1, 1).data;
    sr += p[0]; sg += p[1]; sb += p[2]; n++;
  }
  const r = Math.round(sr / n), g = Math.round(sg / n), b = Math.round(sb / n);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return { r, g, b, brightness };
}
