import { ProviderConfig } from '../config';
import { request } from '../http';

const BATCH_SIZE = 20;

export async function translateWithClaude(
  texts: string[],
  targetLang: string,
  config: ProviderConfig
): Promise<string[]> {
  if (!config.apiKey) throw new Error('Claude API key not configured');

  // Batch translate to avoid token limit issues
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

  const baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/messages`;

  const data = await request(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a UI translator. Output only a valid JSON array. No thinking, no explanation.',
    }),
  });

  // Extract text content (skip thinking blocks)
  let content = '';
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        content = block.text.trim();
        break;
      }
    }
    if (!content) {
      const first = data.content.find((b: any) => b.text);
      if (first) content = first.text.trim();
    }
  }

  if (!content) {
    console.error('[Claude] Empty response:', JSON.stringify(data).slice(0, 300));
    return texts; // Fallback: return originals
  }

  return parseResponse(content, texts);
}

function parseResponse(content: string, originals: string[]): string[] {
  // Try JSON parse
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        // Pad or trim to match expected count
        const result = arr.map(String);
        while (result.length < originals.length) result.push(originals[result.length]);
        return result.slice(0, originals.length);
      }
    } catch {
      // JSON might be truncated, try to fix it
      try {
        let fixed = jsonMatch[0];
        // If truncated, try to close the array
        if (!fixed.endsWith(']')) {
          // Remove last incomplete element and close
          const lastComma = fixed.lastIndexOf(',');
          if (lastComma > 0) {
            fixed = fixed.substring(0, lastComma) + ']';
          }
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

  // Fallback: strip JSON formatting artifacts
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== '[' && l !== ']')
    .map(l => {
      // Remove surrounding quotes and trailing commas
      let s = l.replace(/^["']|["'],?$/g, '').trim();
      // Remove numbered prefix
      s = s.replace(/^\d+\.\s*/, '');
      return s;
    })
    .filter(l => l);

  while (lines.length < originals.length) lines.push(originals[lines.length]);
  return lines.slice(0, originals.length);
}
