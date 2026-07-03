# otc-rate-suite

一个仓库,4 个部署目标。U 价计算器全套:抓取端 → 智能网关 → 前端计算器。

```
otc-rate-suite/
├── apps/
│   ├── gateway/                    → CF Worker：otc-gateway-api（整合数据）
│   │   ├── src/worker.js
│   │   ├── wrangler.toml
│   │   └── .dev.vars.example       （本地调试用，真值不进仓库）
│   ├── spider/                     → CF Worker：otc-spider-api  ＋  VPS Docker
│   │   ├── src/
│   │   │   ├── core/               ← 双平台共用：config / utils / fetch_usd / fetch_usdt
│   │   │   ├── worker-entry.js      （Cloudflare 入口）
│   │   │   └── server-entry.js      （Docker/VPS 入口）
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── web/                        → CF Pages：otc-calc-web
│       ├── index.html
│       └── config.example.js       （模板；真正的 config.js 部署时生成）
├── .github/workflows/
│   ├── deploy-gateway.yml
│   ├── deploy-spider-worker.yml
│   ├── docker-spider.yml
│   ├── deploy-web.yml
│   └── cleanup-ghcr.yml
├── .gitignore
└── README.md
```

## 数据流

```
浏览器(otc-calc-web) → otc-gateway-api → [ VPS抓取节点 (+) Worker抓取节点 ]
                                              ↑ 同一份 apps/spider 代码，两个入口
```

## 部署对照表（照这张表就不会推错地方）

| 改了哪个目录 | 部署到 | 触发方式 | 用到的密钥/变量 |
|---|---|---|---|
| `apps/gateway/**` | Worker `otc-gateway-api` | 自动(push) 或 Actions 手动跑 `Deploy Gateway` | `CF_API_TOKEN`、`CF_ACCOUNT_ID`；运行时变量 `NODES`(CF后台设) |
| `apps/spider/**`(worker) | Worker `otc-spider-api` | 自动 或 手动 `Deploy Spider Worker` | `CF_API_TOKEN`、`CF_ACCOUNT_ID` |
| `apps/spider/**`(docker) | GHCR 镜像 `<repo>-spider:latest` | 自动 或 手动 `Build Spider Docker` | 自带 `GITHUB_TOKEN` |
| `apps/web/**` | Pages `otc-calc-web` | 自动 或 手动 `Deploy Web` | `CF_API_TOKEN`、`CF_ACCOUNT_ID`、`GATEWAY_URL` |

## 一次性配置（只做一次）

**1. GitHub 仓库 → Settings → Secrets and variables → Actions，添加:**
- `CF_API_TOKEN`　你的 Cloudflare API Token
- `CF_ACCOUNT_ID`　你的 Cloudflare Account ID
- `GATEWAY_URL`　网关对外地址(前端会调用它)，如 `https://otc-gateway-api.example.com`

**2. 网关的私人节点地址(你的 VPS)配在 Cloudflare,不进 GitHub:**
- CF 后台 → Workers `otc-gateway-api` → Settings → Variables → 添加 `NODES`(建议加密)
- 值是 JSON 字符串:
  ```json
  [{"id":"🇯🇵 VPS-Tokyo","url":"https://你的vps域名"},{"id":"☁️ CF Worker","url":"https://otc-spider-api.你的域名"}]
  ```
- 或本地执行 `cd apps/gateway && npx wrangler secret put NODES`

> 为什么分两处：`NODES` 是网关**运行时**才用(GitHub Secret 只在构建时存在，进不了运行时)，
> 而 `GATEWAY_URL` 是构建前端时写进 config.js 的。这样你的 VPS 地址永远不出现在仓库里。

## VPS 上跑抓取端(Docker)

```bash
# 拉取 CI 构建好的镜像(把 OWNER/REPO 换成你的)
docker run -d --restart always -p 127.0.0.1:3000:3000 \
  ghcr.io/OWNER/REPO-spider:latest
# 前面用 Caddy/Nginx 套上域名+TLS，再把这个域名填进网关的 NODES 即可
```
或用 `apps/spider/docker-compose.yml`(记得把 image 里的 OWNER 换成你的)。

## ⭐ 加源(重要)：怎么新增一个价格源

契约:每条源都有稳定 `id`、展示名 `source`、角色 `role`("price"进均价 / "reference"仅参考)。

**加一个"进均价"的源(例:火币 我买U)**
1. `apps/spider/src/core/fetch_usdt.js` 里照现有 `makeReq(...)` 复制一行，给它
   `{ id: "htx_buy", source: "火币 [我买U]", role: "price" }` 和对应解析函数。
2. `apps/web/config.example.js` 的 `RATE_GROUPS.usdt` 里加 `{ name:"火币收U", ids:["htx_buy"] }`。
3. 推送 → `Deploy Spider Worker` + `Build Spider Docker` + `Deploy Web`。**网关不用改**。

**加一个"仅参考"的源**
1. 同上第 1 步，但 `role: "reference"`。
2. 结束——前端会自动把它显示在参考区(📎 参考价)，不进均价，`config` 不用动。

> 前端小保险：任何 `role:"price"` 但没被任何组收录的源，会显示 `⚠️ 未入组`，
> 一眼就能看出你是不是忘了在 `RATE_GROUPS` 里登记它。
