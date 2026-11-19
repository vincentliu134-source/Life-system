import { mobileCommand, mobileProfile, mobileRestore, mobileState } from './state';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function installOfflineTransport(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : input.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    try {
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      if (url.pathname === '/api/state' && method === 'GET') return json(await mobileState());
      if (url.pathname === '/api/workspace' && method === 'POST') return json(await mobileCommand(body));
      if (url.pathname === '/api/profile' && method === 'PATCH') return json(await mobileProfile(body));
      if (url.pathname === '/api/restore' && method === 'POST') return json(await mobileRestore(body));
      return json({ message: '手机版离线版本暂不支持这项联网操作' }, 501);
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : '本机操作失败' }, error instanceof Error && error.name === 'ConflictError' ? 409 : 400);
    }
  };
}
