export const STRATEGY_CONFIG = {
    // 1. 数据抓取样本量
    OKX_FETCH_LIMIT: 200,
    BIN_BUY_FETCH_LIMIT: 200,  // 币安「我买U」：过滤严格，加大样本(约10页)
    BIN_SELL_FETCH_LIMIT: 20,  // 币安「我卖U」：仅参考，拉1页足矣
    BITGET_FETCH_LIMIT: 20,    // Bitget「我买U」：单次拉取单数（默认1页20条）

    // 2. 商家风控过滤
    MIN_QUOTE_AMOUNT: 1500,    // 剔除额度 <= 此值的散户小单
    ALLOW_VERIFY_ORDER: false, // 是否允许「验证单」

    // 3. 盘口深度防伪(独立控制)
    OKX_CLUSTER_THRESHOLD: 10,
    OKX_FALLBACK_RANK: 20,

    BIN_BUY_CLUSTER_THRESHOLD: 15,
    BIN_BUY_FALLBACK_RANK: 30,

    BIN_SELL_CLUSTER_THRESHOLD: 1,
    BIN_SELL_FALLBACK_RANK: 1,

    // Bitget 深度防伪参数
    BITGET_CLUSTER_THRESHOLD: 5, // 聚类阈值（若算法按价差计算则设为 0.02，若按订单聚集单数则设为 3~5）
    BITGET_FALLBACK_RANK: 5,     // 兜底取第 N 档（抓取总量为 20 时，不可超过 20）

    // 4. 网络
    REQUEST_TIMEOUT: 8000      // 单接口超时(毫秒)
};
