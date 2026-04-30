const SECRET = 'change-this';

// Simple UA rotation (optional but useful)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17 Mobile Safari/604.1'
];

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  },
};

async function handleRequest(request) {
  const url = new URL(request.url);

  const secCode = url.searchParams.get('sec_code');
  const targetUrl = url.searchParams.get('targetUrl');

  if (secCode !== SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!targetUrl) {
    return new Response('Missing targetUrl parameter', { status: 400 });
  }

  if (!isAllowedTarget(targetUrl)) {
    return new Response('Invalid targetUrl', { status: 400 });
  }

  return fetchWithRetry(request, targetUrl);
}

async function fetchWithRetry(request, targetUrl) {
  const maxAttempts = 3;
  let lastError = null;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await forwardRequest(request, targetUrl);
    } catch (err) {
      lastError = err;
      await sleep(200 * (i + 1)); // small backoff
    }
  }

  return new Response(`Fetch failed: ${lastError?.message}`, {
    status: 502,
  });
}

async function forwardRequest(request, targetUrl) {
  const headers = new Headers(request.headers);

  // Strip CF + forwarding headers
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('x-forwarded-for');

  // Randomise user agent
  headers.set('user-agent', randomItem(USER_AGENTS));

  // Optional: add slight variation
  headers.set('accept-language', randomItem([
    'en-GB,en;q=0.9',
    'en-US,en;q=0.8',
    'en;q=0.7'
  ]));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      signal: controller.signal,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

  } finally {
    clearTimeout(timeout);
  }
}

function isAllowedTarget(targetUrl) {
  try {
    const url = new URL(targetUrl);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
