export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.APP_ORIGIN) {
      return new Response('APP_ORIGIN is not configured.', { status: 500 });
    }

    const upstream = new URL('/api/monthly-report/unsubscribe', env.APP_ORIGIN);
    upstream.search = url.search;

    return fetch(upstream.toString(), {
      method: 'GET',
      headers: {
        Accept: request.headers.get('Accept') || 'text/html',
      },
    });
  },
};
