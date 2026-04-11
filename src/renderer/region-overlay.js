const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

window.api.onShowTranslation((data) => {
  const { blocks, screenshotDataUrl, regionWidth, regionHeight } = data;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const clean = document.createElement('canvas');
    clean.width = img.width;
    clean.height = img.height;
    clean.getContext('2d').drawImage(img, 0, 0);
    const cleanCtx = clean.getContext('2d');

    const scaleX = img.width / regionWidth;
    const scaleY = img.height / regionHeight;

    blocks.forEach(block => {
      const x = Math.round(block.x * scaleX);
      const y = Math.round(block.y * scaleY);
      const w = Math.round(block.width * scaleX);
      const h = Math.round(block.height * scaleY);

      const isBold = h > 44;
      const weight = isBold ? 'bold' : 'normal';
      const fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';

      const heightBased = Math.round(h * 0.75);
      let fontSize = heightBased;
      const minFontSize = Math.max(10, Math.floor(fontSize * 0.6));
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (fontSize > minFontSize && ctx.measureText(block.translated).width > w) {
        fontSize--;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      }

      // Erase original text with sampled background color
      const bgColor = sampleEdgeColor(cleanCtx, x, y, w, h);
      const pad = 2;
      ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
      ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

      // Draw translated text
      const textColor = bgColor.brightness > 128
        ? (bgColor.brightness > 200 ? '#1a1a1a' : '#000000')
        : (bgColor.brightness < 50 ? '#e0e0e0' : '#ffffff');
      ctx.fillStyle = textColor;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(block.translated, x, y + h / 2, w);
    });
  };
  img.src = screenshotDataUrl;
});

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

// Edge-aware window drag + resize
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.close();
});
document.addEventListener('dblclick', () => {
  window.api.close();
});

// Pinch-to-zoom via trackpad
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  window.api.resizeBy(-e.deltaY);
}, { passive: false });
