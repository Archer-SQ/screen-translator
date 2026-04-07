import { execFile, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

let hotkeyProcess: ChildProcess | null = null;
let shouldRestart = true;
let triggerFn: (() => void) | null = null;
let dismissFn: (() => void) | null = null;
let saveCacheFn: (() => void) | null = null;
let cancelFn: (() => void) | null = null;
let currentArgs: string[] = [];

// Hotkey config format: "shift+z+x" or "cmd+t" etc.
export interface HotkeyConfig {
  modifier: string; // shift, cmd, alt, ctrl
  keycodes: number[]; // 1 or 2 keycodes
}

// Map key names to macOS keycodes
const KEY_MAP: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, '1': 18, '2': 19,
  '3': 20, '4': 21, '6': 22, '5': 23, '9': 25, '7': 26, '8': 28, '0': 29,
  o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46,
  '/': 44, '.': 47, ',': 43, ';': 41, '\'': 39, '[': 33, ']': 30,
  space: 49, enter: 36, tab: 48, delete: 51, escape: 53,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
};

export function parseHotkeyString(hotkey: string): HotkeyConfig {
  const parts = hotkey.toLowerCase().split('+').map(s => s.trim());
  let modifier = 'none';
  const keycodes: number[] = [];

  for (const part of parts) {
    if (['shift', 'cmd', 'alt', 'ctrl'].includes(part)) {
      modifier = part;
    } else if (KEY_MAP[part] !== undefined) {
      keycodes.push(KEY_MAP[part]);
    }
  }

  if (keycodes.length === 0) keycodes.push(6, 7); // default z+x
  return { modifier, keycodes };
}

export function startHotkeyMonitor(
  onTrigger: () => void,
  onDismiss: () => void,
  onSaveCache: () => void,
  onCancel: () => void,
  hotkeys?: { trigger?: string; dismiss?: string; cache?: string }
) {
  triggerFn = onTrigger;
  dismissFn = onDismiss;
  saveCacheFn = onSaveCache;
  cancelFn = onCancel;
  shouldRestart = true;

  currentArgs = buildArgs(hotkeys);
  launch();
}

function hotkeyToNativeArg(hotkey: string): string {
  const config = parseHotkeyString(hotkey);
  const parts = [config.modifier, ...config.keycodes.map(String)];
  return parts.join(':');
}

function buildArgs(hotkeys?: { trigger?: string; dismiss?: string; cache?: string }): string[] {
  const t = hotkeyToNativeArg(hotkeys?.trigger || 'shift+z+x');
  const d = hotkeyToNativeArg(hotkeys?.dismiss || 'escape');
  const c = hotkeyToNativeArg(hotkeys?.cache || 'shift+s');
  return ['-t', t, '-d', d, '-c', c];
}

export function restartWithHotkeys(hotkeys: { trigger?: string; dismiss?: string; cache?: string }) {
  currentArgs = buildArgs(hotkeys);
  // Kill and restart
  if (hotkeyProcess) {
    shouldRestart = true;
    hotkeyProcess.kill();
    // Will auto-restart via exit handler
  } else {
    launch();
  }
}

function launch() {
  const binaryPath = getHotkeyBinaryPath();

  if (!fs.existsSync(binaryPath)) {
    const srcPath = binaryPath + '.m';
    if (!fs.existsSync(srcPath)) return;
    try {
      require('child_process').execFileSync('clang', [
        '-O2', srcPath, '-o', binaryPath,
        '-framework', 'Foundation', '-framework', 'Carbon',
        '-framework', 'AppKit', '-fobjc-arc',
      ]);
    } catch { return; }
  }

  console.log(`[hotkey] Launching with args: ${currentArgs.join(' ')}`);
  hotkeyProcess = execFile(binaryPath, currentArgs, { maxBuffer: 1024 * 1024 });

  if (hotkeyProcess.stdout) {
    const rl = readline.createInterface({ input: hotkeyProcess.stdout });
    rl.on('line', (line) => {
      const cmd = line.trim();
      if (cmd === 'TRIGGERED' && triggerFn) triggerFn();
      else if (cmd === 'DISMISS' && dismissFn) dismissFn();
      else if (cmd === 'SAVE_CACHE' && saveCacheFn) saveCacheFn();
      else if (cmd === 'CANCEL' && cancelFn) cancelFn();
    });
  }

  hotkeyProcess.stdin?.on('error', () => {});
  hotkeyProcess.stdout?.on('error', () => {});
  hotkeyProcess.on('error', () => {});

  hotkeyProcess.stderr?.on('data', (data: Buffer) => {
    console.log('[hotkey]', data.toString().trim());
  });

  hotkeyProcess.on('exit', (code) => {
    console.log(`[hotkey] Exited (code ${code})`);
    hotkeyProcess = null;
    if (shouldRestart) setTimeout(launch, 1000);
  });
}

// Notify native process about state changes
export function sendHotkeyState(state: 'SHOWN' | 'HIDDEN') {
  if (hotkeyProcess?.stdin?.writable) {
    hotkeyProcess.stdin.write(state + '\n');
    console.log(`[hotkey] Sent state: ${state}`);
  } else {
    console.log(`[hotkey] Cannot send state (stdin not writable)`);
  }
}

export function stopHotkeyMonitor() {
  shouldRestart = false;
  if (hotkeyProcess) { hotkeyProcess.kill(); hotkeyProcess = null; }
}

function getHotkeyBinaryPath(): string {
  const devPath = path.join(__dirname, '..', '..', 'scripts', 'hotkey-macos');
  if (fs.existsSync(devPath) || fs.existsSync(devPath + '.m')) return devPath;
  return path.join(process.resourcesPath, 'scripts', 'hotkey-macos');
}
