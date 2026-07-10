// apps/gateway/src/worker.js  —— 智能网关 (otc-gateway-api)
// 私人节点地址不写在代码里，改从环境变量 NODES 读取(JSON 字符串)。
// 在 Cloudflare 后台 Settings > Variables 添加 NODES(建议加密),或 `npx wrangler secret put NODES`。
// 示例值:
// [{"id":"🇯🇵 VPS-Tokyo","url":"https://your-vps.example.com"},{"id":"☁️ CF Worker","url":"https://your-spider.example.com"}]

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const jsonResp = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), { status, headers: { "Content-Type": "application/json", ...cors } });

    // ===========================================================
    // 💰 成本价接口 /cost  (Phase 0：手工维护，存 KV，无鉴权)
    // 契约见 docs/ROADMAP.md：未来记账系统以同样形状供数，前端零改动。
    // ⚠️ 无鉴权的前提是这里只存"一个价格数字"。要存交易明细必须先加鉴权。
    // ===========================================================
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === "/cost") {
      if (!env.OTC_KV) {
        return jsonResp({ error: "KV 未绑定。请在 apps/gateway/wrangler.toml 里配置 [[kv_namespaces]] OTC_KV 后重新部署。" }, 500);
      }
      const KV_KEY = "cost:usdt_cny"; // 键名带币对，为未来多币种预留

      if (request.method === "GET") {
        const raw = await env.OTC_KV.get(KV_KEY);
        if (!raw) return jsonResp({ cost_price: null, updated_at: null, source: "manual" });
        try { return jsonResp(JSON.parse(raw)); }
        catch (e) { return jsonResp({ cost_price: null, updated_at: null, source: "manual" }); }
      }

      if (request.method === "POST") {
        let body;
        try { body = await request.json(); }
        catch (e) { return jsonResp({ error: "请求体不是合法 JSON" }, 400); }

        const p = parseFloat(body.cost_price);
        // 传 null / 0 / 非法值 = 清除成本价
        if (!(p > 0)) {
          await env.OTC_KV.delete(KV_KEY);
          return jsonResp({ cost_price: null, updated_at: null, source: "manual" });
        }
        if (p > 100) return jsonResp({ error: "成本价超出合理范围(0~100)，拒绝保存" }, 400);

        const record = { cost_price: Math.round(p * 1000) / 1000, updated_at: Date.now(), source: "manual" };
        await env.OTC_KV.put(KV_KEY, JSON.stringify(record));
        return jsonResp(record);
      }

      return jsonResp({ error: "仅支持 GET / POST" }, 405);
    }

    // —— 读取节点配置 ——
    // CF 后台变量类型选「文本」时 env.NODES 是字符串，需要 JSON.parse；
    // 选「JSON」时 CF 已经帮你解析成对象了，直接用，此时不能再 JSON.parse。
    let NODES = [];
    try {
      NODES = typeof env.NODES === "string" ? JSON.parse(env.NODES) : (env.NODES || []);
    } catch (e) { NODES = []; }
    if (!Array.isArray(NODES) || NODES.length === 0) {
      return new Response(JSON.stringify({
        error: "未配置 NODES 环境变量。请在 Cloudflare 后台 Variables 里添加 NODES(JSON 字符串)。"
      }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
    }

    const NODE_TIMEOUT = 8000;   // 单节点超时
    const HARD_TIMEOUT = 9000;   // 全局兜底：到点就返回已拼到的数据

    // —— 拼图容器 ——
    const bestUsd = new Map();   // id -> source对象
    const bestUsdt = new Map();
    const expectedIds = new Set();                 // 所有节点声称应有的 id(全集)
    const health = new Map(NODES.map(n => [n.id, { // 预填，未按时返回的节点标为轮空
      id: n.id, status: "🔴 超时(轮空)", latency: null, error: "未在时限内返回"
    }]));

    const satisfied = () => new Set([...bestUsd.keys(), ...bestUsdt.keys()]);
    const stitch = (data, nodeId, latency) => {
      for (const [arr, map] of [["usd_sources", bestUsd], ["usdt_sources", bestUsdt]]) {
        if (!Array.isArray(data[arr])) continue;
        for (const item of data[arr]) {
          if (!item || !item.id) continue;
          expectedIds.add(item.id);
          // 按延迟先到先得：第一个成功拿到该 id 的(最快)节点胜出
          if (item.success && item.rate > 0 && !map.has(item.id)) {
            map.set(item.id, { ...item, node: nodeId, latency });
          }
        }
      }
    };
    const isComplete = () => {
      if (expectedIds.size === 0) return false;
      const sat = satisfied();
      for (const id of expectedIds) if (!sat.has(id)) return false;
      return true;
    };

    // —— 并发抓取，谁先回谁先拼；拼齐即返回，不等最慢节点 ——
    let settled = 0;
    await new Promise((resolve) => {
      const hardTimer = setTimeout(resolve, HARD_TIMEOUT);
      const finish = () => { clearTimeout(hardTimer); resolve(); };

      NODES.forEach(async (node) => {
        const start = Date.now();
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), NODE_TIMEOUT);
          const r = await fetch(node.url, { method: "GET", signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const latency = Date.now() - start;

          health.set(node.id, { id: node.id, status: "🟢 在线", latency, error: "" });
          stitch(data, node.id, latency);
        } catch (e) {
          health.set(node.id, { id: node.id, status: "🔴 异常", latency: Date.now() - start, error: e.message });
        } finally {
          settled++;
          if (isComplete() || settled === NODES.length) finish();
        }
      });
    });

    const missing_ids = [...expectedIds].filter(id => !satisfied().has(id));

    return new Response(JSON.stringify({
      usd_sources: Array.from(bestUsd.values()),
      usdt_sources: Array.from(bestUsdt.values()),
      node_health: Array.from(health.values()),
      missing_ids,          // 所有节点都没拿到的源 id → 前端弹"轮空"提醒
      serverTime: Date.now()
    }, null, 2), { headers: { "Content-Type": "application/json", ...cors } });
  }
};
