// src/config.js
export const STRATEGY_CONFIG = {
// 1. 数据抓取配置 
    OKX_FETCH_LIMIT: 200,      
    BIN_BUY_FETCH_LIMIT: 200,  // 【新增】币安我买U：过滤严格，加大样本量拉取 200 条 (约10页)
    BIN_SELL_FETCH_LIMIT: 20,  // 【新增】币安我卖U：极度宽松，只拉取 20 条 (1页) 足矣

    // 2. 商家风控过滤条件
    MIN_QUOTE_AMOUNT: 1500,    // 剔除额度小于等于此数值的“散户小单”
    ALLOW_VERIFY_ORDER: false, // 是否允许“验证单”

    // 3. 盘口深度防伪算法 (三大盘口独立控制区)
    OKX_CLUSTER_THRESHOLD: 10, 
    OKX_FALLBACK_RANK: 20,     

    BIN_BUY_CLUSTER_THRESHOLD: 15, 
    BIN_BUY_FALLBACK_RANK: 30,     

    BIN_SELL_CLUSTER_THRESHOLD: 1, 
    BIN_SELL_FALLBACK_RANK: 1,     

    // 4. 网络配置
    REQUEST_TIMEOUT: 8000      // 接口请求超时时间 (毫秒)
};