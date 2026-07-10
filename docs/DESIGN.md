# otc-rate-suite 设计文档

> 给未来的开发者(人或 AI)：改代码前先读这份文档和 ROADMAP.md。
> 本项目的一切设计围绕两个原则：**改一处不炸另一处**、**不做没有触发条件的过度设计**。

## 1. 项目定位

USDT/CNY 场外交易的**行情聚合 + 报价计算**工具，自用。
它**不是**记账系统——账务是另一个域，见 ROADMAP.md。

## 2. 架构与数据流

```
浏览器(apps/web, CF Pages: otc-calc-web)
    │  GET /          行情
    │  GET|POST /cost 成本价
    ▼
apps/gateway (CF Worker: otc-gateway-api) ←→ KV(OTC_KV, 只存成本价一个数字)
    │  并发拉取 + 按 id 碎片化拼图 + 拼齐即返回
    ├──────────────┬──────────────
    ▼              ▼
VPS 抓取节点     Worker 抓取节点(otc-spider-api)
    └── 同一份 apps/spider 代码，worker-entry / server-entry 两个入口
```

- **spider**：唯一直接接触交易所的层。抓 Binance/OKX/HTX/Bybit 盘口 + 4 个官方 USD 汇率源。
- **gateway**：不抓数据，只做"多节点结果拼图"和成本价存取。节点地址在 CF 后台变量 `NODES` 里，**不进仓库**。
- **web**：纯静态。网关地址由 CI 从 GitHub Variable `GATEWAY_URL` 注入 config.js，**不进仓库**。

## 3. 核心契约（跨端协议，改动需三端同步评估）

### 3.1 源对象（spider 产出 → gateway 透传+盖章 → web 消费）
```jsonc
{
  "id": "bin_buy",        // 稳定标识。前端 RATE_GROUPS 按它匹配。永不改名。
  "source": "Binance [我买U/卖方盘口]",  // 纯展示，随便改
  "role": "price",        // price=进均价 | reference=仅参考(前端自动展示、永不进均价)
  "rate": 6.76, "success": true,
  "debug_summary": "...", "order_details": [...],
  "node": "🇯🇵 VPS", "latency": 640   // gateway 拼图时盖章
}
```
现有 id：`er_api_1` `er_api_2` `floatrates` `currencyapi` `bin_buy` `okx_buy` `htx_buy` `bybit_buy` `bin_sell(reference)`。

### 3.2 网关聚合输出
```jsonc
{ "usd_sources": [...], "usdt_sources": [...],
  "node_health": [{id,status,latency,error}],
  "missing_ids": ["htx_buy"],   // 所有节点都没抓到的源 → 前端弹轮空提醒
  "serverTime": 1783066423811 }
```

### 3.3 成本价接口 `GET|POST /cost`（Phase 0）
```jsonc
{
  "slots": [
    { "price": 6.72, "updated_at": 1783..., "note": "6/20 100万" },
    { "price": 6.75, "updated_at": 1783..., "note": "" },
    { "price": null, "updated_at": null,   "note": "" }
  ],
  "active": 1,          // 生效组下标(0..2)，驱动 卖出U/代收RMB 的成本浮盈
  "source": "manual"
}
```
- 固定 3 个槽，用户手动点选 `active` 生效(方案B)，另两组仅备查。
- POST 提交整份 state 覆盖存储(单用户、last-write-wins)；服务端校验：每组 price ∈ (0,100] 或 null、note ≤20 字、active ∈ 0..2。
- KV 键 `cost:usdt_cny`——键名带币对，为多币种预留。
- `source` 是给未来记账系统留的插槽（届时 `"ledger"`）。

## 4. 设计决策记录（为什么是现在这个样子）

| # | 决策 | 原因 | 什么情况下推翻 |
|---|---|---|---|
| D1 | 前端按 `id` 而非源名匹配 | 源名要盖节点钢印、要改文案，字符串匹配会静默失效 | 不推翻 |
| D2 | `role:reference` 的源不进均价 | 卖U盘口价格偏低会污染报价，但有参考价值 | 不推翻 |
| D3 | 网关"拼齐即返回"不等最慢节点 | 第一个返回节点确定 id 全集(所有节点跑同一份代码)；缺的 id 进 missing_ids | 若未来各节点抓不同源集合，需改全集判定逻辑 |
| D4 | 抓取端双平台、网关只跑 Worker | 只有抓取端需要绕交易所对 CF IP 的封锁(VPS 真实 IP 兜底)；网关没这个需求，不 Docker 化 | Worker 彻底抓不到任何交易所时再议 |
| D5 | NODES 放 CF 后台变量 + `keep_vars=true` | VPS 地址是隐私；keep_vars 防 CI 部署冲掉后台变量 | 不推翻 |
| D6 | KV 绑定必须写在 wrangler.toml | keep_vars 只保变量、**保不住绑定**，后台手加的绑定会被 CI 部署清掉 | 不推翻 |
| D7 | `/cost` 无鉴权 | 自用、URL 不外传、KV 里只有一个价格数字，被改一眼识破、零损失 | **触发条件：一旦要存交易明细/多条记录，必须先加鉴权**（见 ROADMAP 红线） |
| D8 | 成本价 = 3 组手工维护、手动点选生效(方案B) | 现阶段一次性大额买入、卖完前成本固定；可能同时压几批货，故存 3 组备查，但只有生效组进浮盈计算，避免自动滚动误删 | 记账系统(Phase 1)上线后，成本改由 ledger 供数 |
| D9 | HTX/Bybit 带 Origin/Referer 头 | 尝试绕过来源校验的实验性措施，未验证有效 | 观测若持续空结果，考虑仅走 VPS 抓取或砍掉 |

## 5. 加源 SOP

1. `apps/spider/src/core/fetch_usdt.js`（或 fetch_usd.js）照现有 `makeReq` 复制一段，定 `{id, source, role}`。
2. 阈值参数加进 `core/config.js`（不要用 `||0` 这种形同虚设的兜底）。
3. `role:"price"` → 在 `apps/web/config.example.js` 的 `RATE_GROUPS` 登记 id；`role:"reference"` → 什么都不用做。
4. 网关**永远不用改**。
5. 忘了第 3 步的保险：前端会给未登记的 price 源标 `⚠️ 未入组`。

## 6. 部署

见 README.md 的部署对照表。要点：4 个部署目标各自独立 workflow(paths 过滤 + 手动触发)；密钥分布：GitHub Secrets(`CF_API_TOKEN`/`CF_ACCOUNT_ID`)、GitHub Variables(`GATEWAY_URL`)、CF Worker 变量(`NODES`)、wrangler.toml(KV 绑定)。
