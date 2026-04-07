import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface Config {
  hotkey: string;
  dismissKey: string;
  cacheKey: string;
  targetLanguage: string;
  provider: string;
  providers: Record<string, ProviderConfig>;
}

const DEFAULT_CONFIG: Config = {
  hotkey: 'shift+z+x',
  dismissKey: 'escape',
  cacheKey: 'shift+s',
  targetLanguage: 'zh-CN',
  provider: 'google',
  providers: {
    openai: {
      apiKey: '',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
    },
    claude: {
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com',
    },
    deepl: {
      apiKey: '',
    },
    ollama: {
      model: 'qwen2.5',
      baseUrl: 'http://localhost:11434',
    },
  },
};

function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

export function getConfig(): Config {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<Config>): Config {
  const current = getConfig();
  const merged = { ...current, ...config };
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
