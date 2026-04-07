import { ProviderConfig } from '../config';
import { request } from '../http';

export async function translateWithOllama(
  texts: string[],
  targetLang: string,
  config: ProviderConfig
): Promise<string[]> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'qwen2.5';

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `Translate the following texts to ${targetLang}. Return ONLY a JSON array of translated strings in the same order, no explanation.\n\n${numbered}`;

  const data = await request(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a precise translator. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const content = data.message?.content?.trim();
  return parseTranslationResponse(content, texts.length);
}

function parseTranslationResponse(content: string, expectedCount: number): string[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr) && arr.length === expectedCount) {
        return arr.map(String);
      }
    } catch {}
  }
  const lines = content.split('\n').filter(l => l.trim());
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim()).slice(0, expectedCount);
}
