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

    blocks.forEach(block => {
      const x = Math.round(block.x * scaleX);
      const y = Math.round(block.y * scaleY);
      const w = Math.round(block.width * scaleX);
      const h = Math.round(block.height * scaleY);

      const isBold = h > 44;
      const weight = isBold ? 'bold' : 'normal';
      const fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';
      const originalFontSize = detectOriginalFontSize(block.text, w, h, weight, fontFamily);

      const minFontSize = Math.max(10, Math.floor(originalFontSize * MIN_FONT_RATIO));
      let fontSize = originalFontSize;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (fontSize > minFontSize && ctx.measureText(block.translated).width > w) {
        fontSize--;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      }

      // Erase original text: solid fill + edge blur
      const cleanCtx = clean.getContext('2d');
      const bgColor = sampleEdgeColor(cleanCtx, x, y, w, h);

      ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
      ctx.fillRect(x - ERASE_PAD, y - ERASE_PAD, w + ERASE_PAD * 2, h + ERASE_PAD * 2);

      const blurR = Math.max(2, Math.round(h * BLUR_RATIO));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - ERASE_PAD - blurR, y - ERASE_PAD - blurR, w + (ERASE_PAD + blurR) * 2, h + (ERASE_PAD + blurR) * 2);
      ctx.clip();
      ctx.filter = `blur(${blurR}px)`;
      ctx.drawImage(canvas,
        x - ERASE_PAD - blurR, y - ERASE_PAD - blurR, w + (ERASE_PAD + blurR) * 2, h + (ERASE_PAD + blurR) * 2,
        x - ERASE_PAD - blurR, y - ERASE_PAD - blurR, w + (ERASE_PAD + blurR) * 2, h + (ERASE_PAD + blurR) * 2
      );
      ctx.restore();

      // Draw translated text with alignment detection
      const textColor = bgColor.brightness > 128
        ? (bgColor.brightness > 200 ? '#1a1a1a' : '#000000')
        : (bgColor.brightness < 50 ? '#e0e0e0' : '#ffffff');
      ctx.fillStyle = textColor;
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'middle';

      ctx.fillText(block.translated, x, y + h / 2, w);
    });
  };

  img.src = data.screenshotDataUrl || `file://${screenshotPath}`;
});

window.api.onClear(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function detectOriginalFontSize(originalText, boxWidth, boxHeight, weight, fontFamily) {
  const heightBased = Math.round(boxHeight * FONT_HEIGHT_RATIO);

  let widthBased = heightBased;
  if (originalText.length >= 4) {
    for (let size = Math.ceil(boxHeight * 1.1); size >= 8; size--) {
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      if (ctx.measureText(originalText).width <= boxWidth * 1.08) {
        widthBased = size;
        break;
      }
    }
  }

  const best = Math.max(heightBased, widthBased);
  return Math.max(Math.floor(boxHeight * 0.5), Math.min(Math.ceil(boxHeight * 0.95), best));
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
