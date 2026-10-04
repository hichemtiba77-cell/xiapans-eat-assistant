const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_MODEL = 'glm-4-flash';
const MAX_MESSAGES = 16;
const MAX_CONTENT_LENGTH = 2000;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function isValidMessage(message) {
  return message &&
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.length > 0 &&
    message.content.length <= MAX_CONTENT_LENGTH;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ZHIPU_API_KEY) {
    return jsonResponse({ error: 'AI 服务尚未配置' }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: '请求内容不是有效的 JSON' }, 400);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length || messages.length > MAX_MESSAGES || !messages.every(isValidMessage)) {
    return jsonResponse({ error: '对话内容格式不正确或过长' }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.ZHIPU_API_KEY,
      },
      body: JSON.stringify({
        model: ZHIPU_MODEL,
        messages: messages,
        stream: true,
        temperature: 0.9,
        max_tokens: 120,
      }),
    });
  } catch (error) {
    return jsonResponse({ error: '暂时无法连接 AI 服务' }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text()).slice(0, 500);
    return new Response(detail || 'AI 服务调用失败', {
      status: upstream.status || 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function onRequestGet() {
  return jsonResponse({ error: '请使用 POST 请求' }, 405);
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
