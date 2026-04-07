import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface TextBlock {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
