const canvas = document.getElementById('result');
const ctx = canvas.getContext('2d');

window.api.onShowTranslation((data) => {
  const { screenshotPath, blocks } = data;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Keep a clean copy for background pixel copying
    const clean = document.createElement('canvas');
    clean.width = img.width;
    clean.height = img.height;
    clean.getContext('2d').drawImage(img, 0, 0);

    const scaleX = img.width / window.innerWidth;
    const scaleY = img.height / window.innerHeight;

    blocks.forEach(block => {
      const x = Math.round(block.x * scaleX);
      const y = Math.round(block.y * scaleY);
      const w = Math.round(block.width * scaleX);
      const h = Math.round(block.height * scaleY);

      // 1. Detect font size first (need translated width before erasing)
      const isBold = h > 44;
      const weight = isBold ? 'bold' : 'normal';
      const fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';
      const originalFontSize = detectOriginalFontSize(block.text, w, h, weight, fontFamily);

      let fontSize = originalFontSize;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (fontSize > 10 && ctx.measureText(block.translated).width > w + 4) {
        fontSize--;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      }

      // 2. Erase original text
      const pad = 2;

      // Step A: sample background color from edges of clean screenshot
      const cleanCtx = clean.getContext('2d');
      const bgColor = sampleEdgeColor(cleanCtx, x, y, w, h);

      // Step B: solid fill to completely cover original text
      ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
      ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

      // Step C: blur the filled area to blend edges with surroundings
      const blurR = Math.max(2, Math.round(h * 0.15));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - pad - blurR, y - pad - blurR, w + (pad + blurR) * 2, h + (pad + blurR) * 2);
      ctx.clip();
      ctx.filter = `blur(${blurR}px)`;
      ctx.drawImage(canvas,
        x - pad - blurR, y - pad - blurR, w + (pad + blurR) * 2, h + (pad + blurR) * 2,
        x - pad - blurR, y - pad - blurR, w + (pad + blurR) * 2, h + (pad + blurR) * 2
      );
      ctx.restore();

      // 3. Draw translated text
      const textColor = bgColor.brightness > 128
        ? (bgColor.brightness > 200 ? '#1a1a1a' : '#000000')
        : (bgColor.brightness < 50 ? '#e0e0e0' : '#ffffff');
      ctx.fillStyle = textColor;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(block.translated, x, y + h / 2);
    });
  };

  img.src = data.screenshotDataUrl || `file://${screenshotPath}`;
});

window.api.onClear(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function detectOriginalFontSize(originalText, boxWidth, boxHeight, weight, fontFamily) {
  let bestSize = Math.floor(boxHeight * 0.7);

  for (let size = Math.ceil(boxHeight * 1.1); size >= 8; size--) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(originalText).width <= boxWidth * 1.08) {
      bestSize = size;
      break;
    }
  }

  const minSize = Math.floor(boxHeight * 0.5);
  const maxSize = Math.ceil(boxHeight * 0.95);
  return Math.max(minSize, Math.min(maxSize, bestSize));
}

// Sample average color from the edges around a text block
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

// Sample brightness from the edges around a text block
function sampleBrightness(cleanCtx, x, y, w, h) {
  const points = [
    [x - 4, y + h / 2],
    [x + w + 4, y + h / 2],
    [x + w / 2, y - 4],
    [x + w / 2, y + h + 4],
  ];
  let total = 0, count = 0;
  for (const [px, py] of points) {
    const cx = Math.max(0, Math.min(Math.round(px), canvas.width - 1));
    const cy = Math.max(0, Math.min(Math.round(py), canvas.height - 1));
    const p = cleanCtx.getImageData(cx, cy, 1, 1).data;
    total += (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000;
    count++;
  }
  return total / count;
}
