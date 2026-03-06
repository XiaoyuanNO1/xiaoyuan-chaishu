/**
 * 小元拆书 · Knot Agent 代理 (Cloudflare Worker)
 * 解决浏览器直接请求 knot.woa.com 的 CORS 问题
 *
 * 部署方法：
 * 1. 登录 https://dash.cloudflare.com
 * 2. 进入 Workers & Pages → Create → Worker
 * 3. 粘贴本文件内容，部署
 * 4. 将生成的 Worker URL 填入网站的"代理地址"配置
 *
 * 使用方式：
 * POST https://your-worker.workers.dev/proxy
 * Headers:
 *   x-target-url: http://knot.woa.com/apigw/api/v1/agents/agui/{agent_id}
 *   x-knot-api-token: {your_token}
 *   Content-Type: application/json
 * Body: 同 Knot AG-UI 协议
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-knot-api-token, x-target-url',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: '小元拆书 · Knot Agent 代理',
        time: new Date().toISOString(),
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 代理路由
    if (url.pathname === '/proxy' && request.method === 'POST') {
      const targetUrl = request.headers.get('x-target-url');
      const knotToken = request.headers.get('x-knot-api-token');

      if (!targetUrl) {
        return new Response(JSON.stringify({ error: '缺少 x-target-url 请求头' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (!knotToken) {
        return new Response(JSON.stringify({ error: '缺少 x-knot-api-token 请求头' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // 只允许代理 knot.woa.com
      if (!targetUrl.includes('knot.woa.com')) {
        return new Response(JSON.stringify({ error: '只允许代理 knot.woa.com 域名' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      try {
        const body = await request.text();

        const upstreamResp = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-knot-api-token': knotToken,
          },
          body,
        });

        // 透传响应（支持流式 SSE）
        const respHeaders = {
          ...CORS_HEADERS,
          'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/json',
        };

        return new Response(upstreamResp.body, {
          status: upstreamResp.status,
          headers: respHeaders,
        });

      } catch (e) {
        return new Response(JSON.stringify({
          error: '代理请求失败',
          detail: e.message,
        }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: '未知路由' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
