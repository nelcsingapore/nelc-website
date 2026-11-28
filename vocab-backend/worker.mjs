export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.hostname !== 'nelc.sg' || !incoming.pathname.startsWith('/vocab/api/')) {
      return new Response('Not found', { status: 404 });
    }
    const upstream = new URL(incoming.pathname + incoming.search, env.CLOUD_RUN_ORIGIN);
    const headers = new Headers();
    for (const name of ['authorization', 'content-type', 'cookie', 'origin']) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    try {
      const response = await fetch(upstream, {
        method: request.method, headers, body: request.body, redirect: 'manual'
      });
      const result = new Response(response.body, response);
      result.headers.set('Cache-Control', 'no-store');
      return result;
    } catch {
      return Response.json({ error: '暂时连不上练习服务，请重试。' }, {
        status: 502, headers: { 'Cache-Control': 'no-store' }
      });
    }
  }
};
