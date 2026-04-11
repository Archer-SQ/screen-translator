const sel = document.getElementById('selection');
const sizeLabel = document.getElementById('size');
const hint = document.getElementById('hint');
const dim = document.getElementById('dim');
const bg = document.getElementById('bg');

window.api.onBackground((dataUrl) => {
  bg.src = dataUrl;
});

let startX = 0, startY = 0;
let isDrawing = false;

document.addEventListener('mousedown', (e) => {
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  sel.style.left = startX + 'px';
  sel.style.top = startY + 'px';
  sel.style.width = '0px';
  sel.style.height = '0px';
  sel.style.display = 'block';
  sizeLabel.style.display = 'block';
  hint.style.display = 'none';
  dim.style.display = 'none'; // selection box-shadow takes over dimming
});

document.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const x = Math.min(startX, e.clientX);
  const y = Math.min(startY, e.clientY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  sel.style.left = x + 'px';
  sel.style.top = y + 'px';
  sel.style.width = w + 'px';
  sel.style.height = h + 'px';
  sizeLabel.textContent = `${w} × ${h}`;
  sizeLabel.style.left = (x + w + 4) + 'px';
  sizeLabel.style.top = (y + h + 4) + 'px';
});

document.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  const x = Math.min(startX, e.clientX);
  const y = Math.min(startY, e.clientY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  if (w < 10 || h < 10) {
    window.api.cancelSelection();
    return;
  }
  window.api.confirmSelection({ x, y, width: w, height: h });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.cancelSelection();
});
