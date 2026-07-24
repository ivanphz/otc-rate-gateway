# otc-rate-suite 现状快照 / 归档说明

> 这份文档回答：现在什么在跑、什么能用、还剩什么没做、什么时候该把项目"解冻"。
> 归档日期：2026-07（项目进入维护/归档状态）。
> 隐私：本文不写具体域名/VPS 地址——它们分别在 GitHub Variable `GATEWAY_URL` 和 CF 后台变量 `NODES` 里，仓库不留私有地址。

## 一句话现状

核心功能（行情聚合 + 报价计算 + 3 组成本浮盈）**稳定运行，已归档**。
除"抓取端对 HTX/Bybit 的抓取可靠性"外，**没有其他待办**。

## 线上部署清单

| 部署目标 | 类型 | 状态 | 备注 |
|---|---|---|---|
| otc-gateway-api | CF Worker | ✅ 在线 | 行情拼图 + `/cost` 成本存取；`keep_vars=true`，KV 绑定已写入 wrangler.toml |
| otc-spider-api | CF Worker | ✅ 在线 | 抓取端 Worker 版（兜底） |
| 抓取端 VPS 节点 | Docker | ✅ 在线 | 真实 IP，抓 Binance 主力；地址在 CF 后台 `NODES` |
| otc-calc-web | CF Pages | ✅ 在线 | 前端计算器 |
| KV 命名空间 | CF KV | ✅ 已配置 | 绑定名 `OTC_KV`，只存成本价（见 wrangler.toml） |
| GitHub 密钥/变量 | — | ✅ 已配置 | Secrets: `CF_API_TOKEN`/`CF_ACCOUNT_ID`；Variables: `GATEWAY_URL` |

## 已实现能力（都稳定）

- **行情**：Binance「我买U」、OKX「我买U」进均价；Binance「我卖U」作参考（不进均价）；4 个官方 USD 汇率源。网关"拼齐即返回、不等最慢节点"，带 `node_health` 集群探针和 `missing_ids` 轮空提醒。
- **报价**：代收RMB / 卖出U / 买入U / 代付RMB 四模块，含"按目标利润率"的参考报价表、实际利差、实际汇率、净利润。
- **成本浮盈**：3 组手工成本，手动点选一组生效，驱动 卖出U / 代收RMB 的浮盈；存网关 KV，跨设备同步。
- **部署**：4 个部署目标各自独立 workflow（路径过滤 + 手动触发）；私有地址全部仓库外注入。
- **前端兼容**：桌面/手机响应式；已修 iPhone Safari 数字输入框原生箭头挤乱布局的问题。

## 唯一待办：HTX / Bybit 抓取可靠性（可选，非阻塞）

**现象**：`htx_buy` / `bybit_buy` 从 Worker 抓取持续轮空（返回 `success:true, rate:null`，即接口通但拿到 0 条）。加 `Origin`/`Referer` 头后仍未解决——判断是交易所对非登录态/机房 IP 做了静默过滤（HTX 返回空数组而非 403）。

**影响**：**零阻塞**。这两个源的 id 已在前端 `RATE_GROUPS` 登记，一旦哪天能抓到数据会自动进均价；当前它们显示为失败/未入组，不影响 Binance/OKX 报价，也不会报错。

**将来若想收拾，三个方向（按推荐度）**：
1. **让 VPS 抓取节点专门抓 HTX/Bybit**（真实住宅/机房 IP 更可能过反爬）——和现在币安靠 VPS 兜底同思路。改动在抓取端，不动契约。
2. **直接砍掉这两个源**：删 `apps/spider/src/core/fetch_usdt.js` 里对应两段 + `config.js` 的阈值 + `apps/web/config.example.js` 的 `RATE_GROUPS` 里的 `htx_buy`/`bybit_buy`。网关不用动。
3. 换非 P2P 的官方公开行情接口（注意：那是挂单价，不是 OTC 盘口，语义不同，一般不建议）。

## 其他小尾巴（nice-to-have，不做也没事）

- `GATEWAY_URL` 末尾若带 `/`，前端和网关都已容错（会把 `//cost` 归一成 `/cost`），去不去无所谓。
- `docker-compose.yml` / README 里的 `OWNER/REPO` 占位符——当前部署已填好；仅在全新克隆重建时需替换成你的 GitHub 用户名/仓库名。

## 什么时候该"解冻"

- **恢复高频买卖 U，或想算真实利润/库存/多币种成本** → 启动 `ledger`（**独立新仓库**，不动本仓库），见 `ROADMAP.md` Phase 1。前端接入点已预留：读成本只走 `getActiveCost()`、`/cost` 有 `source` 插槽、交易推送有 `/trades` 契约草案。
- **Binance/OKX 也被封、行情抓不动** → 见 `DESIGN.md` 决策 D4，靠 VPS 兜底或换源。
- **要往 `/cost` 存交易明细/逐笔流水** → 先加鉴权，见 `ROADMAP.md` 红线 §4（这是硬约束，别图省事跳过）。

## 日常自检（30 秒运维快查）

1. 打开前端页面，看底部"集群状态监控"：两个抓取节点应为 🟢 在线；`missing_ids` 若有，预期只出现 `htx_buy` / `bybit_buy`（其它源出现即异常）。
2. 直接看抓取端原始 JSON（`NODES` 里的 worker 地址）：确认各源 `success:true` 且 `rate` 是正常数字。
3. 看网关聚合（`GATEWAY_URL`）：确认 `usd_sources` / `usdt_sources` 拼图完整。
4. 成本接口（`GATEWAY_URL` + `/cost`）：确认能读回 `{slots, active, source}`。

## 文档地图

- **README.md** — 部署对照表、一次性配置、加源 SOP。
- **DESIGN.md** — 架构、三端契约、9 条设计决策（每条附"何时推翻"）。
- **ROADMAP.md** — 未来路线（ledger）、预留接口、安全红线。
- **STATUS.md** — 本文，现状快照 + 唯一待办 + 解冻条件。
