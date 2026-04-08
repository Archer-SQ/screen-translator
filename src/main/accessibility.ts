import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { TextBlock } from './ocr';

export interface AXTextBlock extends TextBlock {
  role: string;
}

export function getAccessibilityText(pid?: number): Promise<AXTextBlock[]> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath();

    if (!fs.existsSync(binaryPath)) {
      const srcPath = binaryPath + '.m';
      if (!fs.existsSync(srcPath)) { resolve([]); return; }
      try {
        require('child_process').execFileSync('clang', [
          '-O2', srcPath, '-o', binaryPath,
          '-framework', 'Foundation', '-framework', 'AppKit',
          '-framework', 'ApplicationServices', '-fobjc-arc',
        ]);
      } catch { resolve([]); return; }
    }

    const args = pid ? [String(pid)] : [];
    execFile(binaryPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('[ax] Accessibility failed, will fallback to OCR:', stderr?.trim());
        resolve([]);
        return;
      }
      try {
        const blocks: AXTextBlock[] = JSON.parse(stdout.trim());
        resolve(blocks);
      } catch {
        resolve([]);
      }
    });
  });
}

function getBinaryPath(): string {
  const devPath = path.join(__dirname, '..', '..', 'scripts', 'axtext-macos');
  if (fs.existsSync(devPath) || fs.existsSync(devPath + '.m')) return devPath;
  return path.join(process.resourcesPath, 'scripts', 'axtext-macos');
}
