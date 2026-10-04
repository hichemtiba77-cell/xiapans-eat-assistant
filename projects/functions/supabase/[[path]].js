const SUPABASE_ORIGIN = 'https://nwnbcpkpssxqrnvyyzzl.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer, Range, X-Client-Info, X-Supabase-Api-Version',
    'Access-Control-Expose-Headers': 'Content-Range, X-Client-Info',
    'Access-Control-Max-Age': '86400',
  };
}

export async function onRequest(context) {
  const request = context.request;
  const incomingUrl = new URL(request.url);
  const path = Array.isArray(context.params.path)
    ? context.params.path.join('/')
    : (context.params.path || '');
  const upstreamUrl = new URL('/' + path, SUPABASE_ORIGIN);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('origin');
  headers.delete('referer');

  const init = {
    method: request.method,
    headers: headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), init);
  } catch (error) {
    return new Response(JSON.stringify({ message: 'Supabase 代理暂时不可用' }), {
      status: 502,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders()),
    });
  }

  const responseHeaders = new Headers(upstream.headers);
  Object.entries(corsHeaders()).forEach(function (entry) { responseHeaders.set(entry[0], entry[1]); });
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
