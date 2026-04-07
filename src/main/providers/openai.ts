import { ProviderConfig } from '../config';
import { request } from '../http';

const BATCH_SIZE = 20;

export async function translateWithOpenAI(
  texts: string[],
  targetLang: string,
  config: ProviderConfig
): Promise<string[]> {
  if (!config.apiKey) throw new Error('OpenAI API key not configured');

  const results: string[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(batch, targetLang, config);
    results.push(...translated);
  }
  return results;
}

async function translateBatch(
  texts: string[],
  targetLang: string,
  config: ProviderConfig
): Promise<string[]> {
  const input = JSON.stringify(texts);
  const prompt = `Translate this JSON array of UI texts to ${targetLang}. Rules:
- Return ONLY a JSON array of the same length
- Keep proper nouns, brand names, URLs, numbers unchanged
- Translate naturally for UI context
- No explanation, no markdown, just the JSON array

${input}`;

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const data = await request(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a UI translator. Output only a valid JSON array.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[OpenAI] Empty response:', JSON.stringify(data).slice(0, 300));
    return texts;
  }
  return parseResponse(content, texts);
}

function parseResponse(content: string, originals: string[]): string[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        const result = arr.map(String);
        while (result.length < originals.length) result.push(originals[result.length]);
        return result.slice(0, originals.length);
      }
    } catch {
      try {
        let fixed = jsonMatch[0];
        if (!fixed.endsWith(']')) {
          const lastComma = fixed.lastIndexOf(',');
          if (lastComma > 0) fixed = fixed.substring(0, lastComma) + ']';
        }
        const arr = JSON.parse(fixed);
        if (Array.isArray(arr)) {
          const result = arr.map(String);
          while (result.length < originals.length) result.push(originals[result.length]);
          return result.slice(0, originals.length);
        }
      } catch {}
    }
  }

  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== '[' && l !== ']')
    .map(l => l.replace(/^["']|["'],?$/g, '').replace(/^\d+\.\s*/, '').trim())
    .filter(l => l);

  while (lines.length < originals.length) lines.push(originals[lines.length]);
  return lines.slice(0, originals.length);
}
