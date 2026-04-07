import { Config } from './config';
import { translateWithOpenAI } from './providers/openai';
import { translateWithClaude } from './providers/claude';
import { translateWithDeepL } from './providers/deepl';
import { translateWithOllama } from './providers/ollama';
import { translateWithGoogle } from './providers/google';

export async function translate(
  texts: string[],
  targetLang: string,
  config: Config
): Promise<string[]> {
  if (texts.length === 0) return [];

  const provider = config.provider;
  const providerConfig = config.providers[provider] || {};

  switch (provider) {
    case 'google':
      return translateWithGoogle(texts, targetLang, providerConfig);
    case 'openai':
      return translateWithOpenAI(texts, targetLang, providerConfig);
    case 'claude':
      return translateWithClaude(texts, targetLang, providerConfig);
    case 'deepl':
      return translateWithDeepL(texts, targetLang, providerConfig);
    case 'ollama':
      return translateWithOllama(texts, targetLang, providerConfig);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
