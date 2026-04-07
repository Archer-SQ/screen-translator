import { net } from 'electron';

interface RequestOptions {
  method: string;
  headers: Record<string, string>;
  body: string;
}

export function request(url: string, options: RequestOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: options.method,
    });

    for (const [key, value] of Object.entries(options.headers)) {
      req.setHeader(key, value);
    }

    req.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk.toString(); });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
      response.on('error', reject);
    });

    req.on('error', reject);
    req.write(options.body);
    req.end();
  });
}
