// apps/web/config.example.js
// —— 可安全上传 GitHub 的模板。真正的 config.js 由 CI 部署时生成(见 deploy-web.yml)。——
// 本地测试：cp config.example.js config.js，把 __WORKER_URL__ 换成你的网关地址即可。
window.APP_CONFIG = {
    // 网关地址(浏览器直接访问的那个)。部署时由 GitHub Secret: GATEWAY_URL 注入。
    WORKER_URL: "__WORKER_URL__",

    // 四个计算模块的展示排序
    MODULE_ORDER: [
        'card_recv_rmb',  // 代收RMB
        'card_sell_u',    // 卖出U
        'card_buy_u',     // 买入U
        'card_pay_rmb'    // 代付RMB
    ],

    // 分组引擎：前端按稳定 id 匹配信源、算均价。
    // 加源指引：抓取端新增一条 role:"price" 的源后，只需把它的 id 填到下面某个组里(或新开一组)。
    //           role:"reference" 的源不用配，会自动进"参考区"展示、不参与均价。
    RATE_GROUPS: {
        usd: [
            { name: "ER组",    ids: ["er_api_1", "er_api_2"] },
            { name: "Float组", ids: ["floatrates"] },
            { name: "Cur组",   ids: ["currencyapi"] }
        ],
        usdt: [
            { name: "币安收U均价", ids: ["bin_buy"] },
            { name: "OKX收U均价",  ids: ["okx_buy"] }
            // 例：以后加了火币"我买U"，抓取端给它 id: "htx_buy"，这里就写 { name:"火币收U", ids:["htx_buy"] }
        ]
    },

    // 偏离系统均价超过此比例，弹「暴利/捡漏」防呆预警。
    // 当前 0.03 = 3%（原先是 0.05=5%，你手动调低到了 3%）。
    WARN_DEVIATION_PCT: 0.03
};
