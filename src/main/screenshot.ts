import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function takeScreenshot(region?: CaptureRegion): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(os.tmpdir(), filename);

    const args = ['-x', '-t', 'png'];
    if (region) {
      args.push('-R', `${region.x},${region.y},${region.width},${region.height}`);
    }
    args.push(filepath);

    execFile('screencapture', args, (error) => {
      if (error) {
        reject(new Error(`Screenshot failed: ${error.message}`));
        return;
      }
      resolve(filepath);
    });
  });
}
