import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export function takeScreenshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(os.tmpdir(), filename);

    // macOS: -x no sound, -C excluded (no cursor) so mouse position doesn't affect cache
    execFile('screencapture', ['-x', '-t', 'png', filepath], (error) => {
      if (error) {
        reject(new Error(`Screenshot failed: ${error.message}`));
        return;
      }
      resolve(filepath);
    });
  });
}
