import { ProviderConfig } from '../config';
import { execSync } from 'child_process';

const BATCH_SIZE = 20;
let proxyInitialized = false;

function getSystemProxy(): string | null {
  try {
    const output = execSync('scutil --proxy', { timeout: 3000 }).toString();
    const enabled = output.match(/HTTPSEnable\s*:\s*(\d)/);
    const host = output.match(/HTTPSProxy\s*:\s*(\S+)/);
    const port = output.match(/HTTPSPort\s*:\s*(\S+)/);
    if (enabled?.[1] === '1' && host && port) {
      return `http://${host[1]}:${port[1]}`;
    }
    // Fallback to HTTP proxy
    const hEnabled = output.match(/HTTPEnable\s*:\s*(\d)/);
    const hHost = output.match(/HTTPProxy\s*:\s*(\S+)/);
    const hPort = output.match(/HTTPPort\s*:\s*(\S+)/);
    if (hEnabled?.[1] === '1' && hHost && hPort) {
      return `http://${hHost[1]}:${hPort[1]}`;
    }
  } catch {}
  return null;
}

function ensureProxy() {
  if (proxyInitialized) return;
  proxyInitialized = true;

  let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
            || process.env.https_proxy || process.env.http_proxy;

  if (!proxy) {
    const sysProxy = getSystemProxy();
    if (sysProxy) {
      proxy = sysProxy;
      console.log(`[Google] Using system proxy: ${proxy}`);
    }
  }

  if (!proxy) {
    console.log('[Google] No proxy found, using direct connection');
    return;
  }

  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`[Google] Proxy configured: ${proxy}`);
  } catch (err) {
    console.log('[Google] Failed to set proxy agent:', err);
  }
}

export async function translateWithGoogle(
  texts: string[],
  targetLang: string,
  _config: ProviderConfig
): Promise<string[]> {
  ensureProxy();
  const { default: translate } = await import('google-translate-api-x');

  const results: string[] = [];
  let lastError: string | null = null;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await translate(batch, { to: targetLang } as any);
      const resAny = res as any;
      const translated = Array.isArray(resAny)
        ? resAny.map((r: any) => r.text)
        : [resAny.text];
      results.push(...translated);
    } catch (err: any) {
      lastError = err.message;
      console.error(`[Google] Batch ${i} failed:`, err.message);
      results.push(...batch);
    }
  }
  if (lastError && results.every((r, i) => r === texts[i])) {
    throw new Error(`Google Translate failed: ${lastError}`);
  }
  return results;
}
