import { ProviderConfig } from '../config';
import { request } from '../http';

// DeepL language code mapping
const DEEPL_LANG_MAP: Record<string, string> = {
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  'en': 'EN',
  'ja': 'JA',
  'ko': 'KO',
  'fr': 'FR',
  'de': 'DE',
  'es': 'ES',
  'pt': 'PT-BR',
  'it': 'IT',
  'ru': 'RU',
};

export async function translateWithDeepL(
  texts: string[],
  targetLang: string,
  config: ProviderConfig
): Promise<string[]> {
  if (!config.apiKey) throw new Error('DeepL API key not configured');

  const deeplLang = DEEPL_LANG_MAP[targetLang] || targetLang.toUpperCase();

  // DeepL supports batch translation natively
  const params = new URLSearchParams();
  texts.forEach(t => params.append('text', t));
  params.append('target_lang', deeplLang);

  // DeepL Free vs Pro endpoint
  const isFree = config.apiKey.endsWith(':fx');
  const baseUrl = isFree
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';

  const data = await request(`${baseUrl}/v2/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
    },
    body: params.toString(),
  });

  if (data.translations && Array.isArray(data.translations)) {
    return data.translations.map((t: { text: string }) => t.text);
  }

  throw new Error('Unexpected DeepL response');
}
