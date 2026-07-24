# otc-rate-suite

一个仓库,4 个部署目标。U 价计算器全套:抓取端 → 智能网关 → 前端计算器。

> 📖 改代码前先读 `docs/DESIGN.md`(架构与设计决策) 和 `docs/ROADMAP.md`(迭代方向与预留接口)。
> 📌 想知道现在什么在跑、还剩什么待办、什么时候该解冻 → 看 `docs/STATUS.md`(现状快照/归档说明)。

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

Secrets 标签页(加密，敏感凭证):
- `CF_API_TOKEN`　你的 Cloudflare API Token
- `CF_ACCOUNT_ID`　你的 Cloudflare Account ID

Variables 标签页(明文即可，因为它本来就会出现在浏览器可见的 config.js 里):
- `GATEWAY_URL`　网关对外地址(前端会调用它)，如 `https://otc-gateway-api.example.com`

**2. 网关的私人节点地址(你的 VPS)配在 Cloudflare 后台的 Variables,不进 GitHub:**
- CF 后台 → Workers `otc-gateway-api` → 设置 → 变量和密钥 → 添加变量 → 名称填 `NODES`,类型选**明文(Variable)**即可(不用加密)
- 值是 JSON 字符串(建议压缩成一行,不要带换行):
  ```json
  [{"id":"🇯🇵 VPS-Tokyo","url":"https://你的vps域名"},{"id":"☁️ CF Worker","url":"https://otc-spider-api.你的域名"}]
  ```
- `apps/gateway/wrangler.toml` 里已经加了 `keep_vars = true`，这一步**只用做一次**：
  之后不管 GitHub Actions 怎么部署这个网关，后台设的 `NODES` 都不会再被冲掉了。
  （如果没有这行配置，Wrangler 每次部署都会把 wrangler.toml 里没声明的后台变量全部清空——你之前遇到的就是这个问题。）
- 以后要改节点地址，直接去 CF 后台改这个 Variable 的值就行，不用碰代码、不用重新部署。

**3. 成本价功能的 KV（当前部署已配置好；以下是从零部署时的步骤，不用这个功能可跳过）:**
- CF 后台 → 存储和数据库 → KV → 创建命名空间（名字随意，如 `otc-data`），复制它的「命名空间 ID」
- 打开 `apps/gateway/wrangler.toml`，把 `[[kv_namespaces]]` 那三行的注释去掉、粘贴 ID，推送部署
- ⚠️ 绑定必须写在 wrangler.toml：`keep_vars` 只保得住变量，保不住后台手动加的 KV 绑定（CI 部署会清掉后台加的绑定）
- 命名空间 ID 不是敏感信息，可放心进公开仓库

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
