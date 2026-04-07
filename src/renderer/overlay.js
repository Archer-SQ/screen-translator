const canvas = document.getElementById('result');
const ctx = canvas.getContext('2d');

window.api.onShowTranslation((data) => {
  const { screenshotPath, blocks } = data;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.width / window.innerWidth;
    const scaleY = img.height / window.innerHeight;

    blocks.forEach(block => {
      const x = Math.round(block.x * scaleX);
      const y = Math.round(block.y * scaleY);
      const w = Math.round(block.width * scaleX);
      const h = Math.round(block.height * scaleY);

      // 1. Sample background
      const bgColor = sampleBackground(x, y, w, h);

      // 2. Reverse-engineer the original font size from original text + box width
      const isBold = h > 44;
      const weight = isBold ? 'bold' : 'normal';
      const fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';

      const originalFontSize = detectOriginalFontSize(block.text, w, h, weight, fontFamily);

      // 3. Use same font size for translation, shrink only if too wide
      let fontSize = originalFontSize;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (fontSize > 10 && ctx.measureText(block.translated).width > w + 4) {
        fontSize--;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      }

      // 4. Erase original text
      ctx.fillStyle = bgColor.css;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

      // 5. Draw translated text
      const textColor = detectTextColor(bgColor);
      ctx.fillStyle = textColor;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'middle';

      const textWidth = ctx.measureText(block.translated).width;
      // Keep same horizontal alignment as original
      const tx = textWidth <= w ? x : x; // left-aligned within the box
      ctx.fillText(block.translated, tx, y + h / 2, w + 4);
    });
  };

  img.src = data.screenshotDataUrl || `file://${screenshotPath}`;
});

window.api.onClear(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Reverse-engineer the font size that the original text was rendered at
// by finding the font size where measureText(originalText).width ≈ boxWidth
function detectOriginalFontSize(originalText, boxWidth, boxHeight, weight, fontFamily) {
  // Start from a size based on box height, then binary search for best fit
  let lo = 8, hi = Math.ceil(boxHeight * 1.1);
  let bestSize = Math.floor(boxHeight * 0.7); // fallback

  // Quick scan from high to low
  for (let size = hi; size >= lo; size--) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const measured = ctx.measureText(originalText).width;
    if (measured <= boxWidth * 1.08) { // 8% tolerance for font differences
      bestSize = size;
      break;
    }
  }

  // Clamp to reasonable range relative to box height
  const minSize = Math.floor(boxHeight * 0.5);
  const maxSize = Math.ceil(boxHeight * 0.95);
  return Math.max(minSize, Math.min(maxSize, bestSize));
}

function sampleBackground(x, y, w, h) {
  const samples = [];
  const m = 6;
  const points = [
    [x + w * 0.2, y - m], [x + w * 0.5, y - m], [x + w * 0.8, y - m],
    [x + w * 0.2, y + h + m], [x + w * 0.5, y + h + m], [x + w * 0.8, y + h + m],
    [x - m, y + h * 0.3], [x - m, y + h * 0.7],
    [x + w + m, y + h * 0.3], [x + w + m, y + h * 0.7],
    [x - m, y - m], [x + w + m, y - m],
    [x - m, y + h + m], [x + w + m, y + h + m],
  ];

  for (const [sx, sy] of points) {
    const px = Math.max(0, Math.min(Math.round(sx), canvas.width - 1));
    const py = Math.max(0, Math.min(Math.round(sy), canvas.height - 1));
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    samples.push({ r: pixel[0], g: pixel[1], b: pixel[2] });
  }

  samples.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  const s = Math.floor(samples.length * 0.25), e = Math.floor(samples.length * 0.75);
  const cluster = samples.slice(s, e);
  const avg = cluster.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
  const n = cluster.length;
  const r = Math.round(avg.r / n), g = Math.round(avg.g / n), b = Math.round(avg.b / n);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return { r, g, b, brightness, css: `rgb(${r},${g},${b})` };
}

function detectTextColor(bgColor) {
  if (bgColor.brightness > 128) {
    return bgColor.brightness > 200 ? '#1a1a1a' : '#000000';
  } else {
    return bgColor.brightness < 50 ? '#e0e0e0' : '#ffffff';
  }
}
