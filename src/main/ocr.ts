import { execFile } from 'child_process';
import { nativeImage } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface TextBlock {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Split an image into 2x2 overlapping quadrants, OCR each concurrently, merge results.
// Smaller regions give Vision OCR better accuracy than one huge image.
export async function performOCRSplit(imagePath: string): Promise<TextBlock[]> {
  const img = nativeImage.createFromPath(imagePath);
  const { width, height } = img.getSize();

  // For small images, just run normal OCR
  if (width < 1500 && height < 1500) {
    return performOCR(imagePath);
  }

  const overlap = 0.1; // 10% overlap to catch boundary text
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const ox = Math.round(width * overlap);
  const oy = Math.round(height * overlap);

  const quadrants = [
    { x: 0, y: 0, w: halfW + ox, h: halfH + oy },
    { x: halfW - ox, y: 0, w: halfW + ox, h: halfH + oy },
    { x: 0, y: halfH - oy, w: halfW + ox, h: halfH + oy },
    { x: halfW - ox, y: halfH - oy, w: halfW + ox, h: halfH + oy },
  ];

  const tmpDir = os.tmpdir();
  const results = await Promise.all(quadrants.map(async (q, i) => {
    const cropped = img.crop({ x: q.x, y: q.y, width: q.w, height: q.h });
    const cropPath = path.join(tmpDir, `ocr-quad-${Date.now()}-${i}.png`);
    fs.writeFileSync(cropPath, cropped.toPNG());
    const blocks = await performOCR(cropPath);
    try { fs.unlinkSync(cropPath); } catch {}
    // Offset coordinates back to full image space
    return blocks.map(b => ({ ...b, x: b.x + q.x, y: b.y + q.y }));
  }));

  // Merge and dedupe overlapping blocks at quadrant boundaries
  const all = results.flat();
  return dedupeBlocks(all);
}

function dedupeBlocks(blocks: TextBlock[]): TextBlock[] {
  const kept: TextBlock[] = [];
  for (const b of blocks) {
    const duplicate = kept.find(k => {
      const ix = Math.max(0, Math.min(k.x + k.width, b.x + b.width) - Math.max(k.x, b.x));
      const iy = Math.max(0, Math.min(k.y + k.height, b.y + b.height) - Math.max(k.y, b.y));
      const overlap = ix * iy;
      const bArea = b.width * b.height;
      const kArea = k.width * k.height;
      return overlap / Math.min(bArea, kArea) > 0.5 && k.text === b.text;
    });
    if (!duplicate) kept.push(b);
  }
  return kept;
}

export function performOCR(imagePath: string): Promise<TextBlock[]> {
  return new Promise((resolve, reject) => {
    const sourcePath = getSourcePath();
    const binaryPath = sourcePath.replace('.m', '');

    const run = () => {
      execFile(binaryPath, [imagePath], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`OCR failed: ${stderr || error.message}`));
          return;
        }
        try {
          const blocks: TextBlock[] = JSON.parse(stdout.trim());
          resolve(blocks);
        } catch {
          reject(new Error(`OCR parse failed: ${stdout}`));
        }
      });
    };

    // Check if binary exists and is newer than source
    if (fs.existsSync(binaryPath)) {
      const srcStat = fs.statSync(sourcePath);
      const binStat = fs.statSync(binaryPath);
      if (binStat.mtimeMs >= srcStat.mtimeMs) {
        run();
        return;
      }
    }

    // Compile Objective-C source with clang
    execFile('clang', [
      '-O2', sourcePath,
      '-o', binaryPath,
      '-framework', 'Foundation',
      '-framework', 'Vision',
      '-framework', 'AppKit',
      '-fobjc-arc',
    ], (compileErr, _stdout, compileStderr) => {
      if (compileErr) {
        reject(new Error(`OCR compilation failed: ${compileStderr || compileErr.message}`));
        return;
      }
      run();
    });
  });
}

function getSourcePath(): string {
  const devPath = path.join(__dirname, '..', '..', 'scripts', 'ocr-macos.m');
  if (fs.existsSync(devPath)) return devPath;

  const prodPath = path.join(process.resourcesPath, 'scripts', 'ocr-macos.m');
  if (fs.existsSync(prodPath)) return prodPath;

  throw new Error('OCR source not found');
}
