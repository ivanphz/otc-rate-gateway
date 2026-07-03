// src/core/fetch_usdt.js
import { fetchWithTimeout, makeReq, calculateDepthPrice } from './utils.js';
import { STRATEGY_CONFIG } from './config.js';

export const getUsdtRates = async () => {

    // 币安盘口抓取包装器
    // meta = { id, source, role }
    const fetchBinanceBook = async (tradeType, meta, isDescending, threshold, fallbackRank, fetchLimit) => {
        const base = { id: meta.id, source: meta.source, role: meta.role || "price" };

        let limit = fetchLimit || 100;
        let maxRowsPerPage = 20;
        let pages = Math.ceil(limit / maxRowsPerPage);
        let fetchPromises = [];

        for (let i = 1; i <= pages; i++) {
            let payload = { "page": i, "rows": maxRowsPerPage, "payTypes": [], "asset": "USDT", "tradeType": tradeType, "fiat": "CNY", "publisherType": null };
            let reqPromise = fetchWithTimeout("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                body: JSON.stringify(payload)
            }, STRATEGY_CONFIG.REQUEST_TIMEOUT).then(r => r.json()).then(d => d.data || []).catch(e => []);
            fetchPromises.push(reqPromise);
        }

        let results = await Promise.all(fetchPromises);
        let rawOrders = results.flat().slice(0, limit);

        if (rawOrders.length === 0) {
            return { ...base, success: false, rate: null, debug_summary: "API 异常/被拦截", order_details: [] };
        }

        let details = rawOrders.map(o => {
            let maxAmt = parseFloat(o.adv.dynamicMaxSingleTransAmount || o.adv.maxSingleTransAmount || 99999);
            let isVerify = o.adv.takerAdditionalKycRequired === 1;
            let isTradable = o.adv.isTradable === true;

            let isValid = true;
            if (maxAmt <= STRATEGY_CONFIG.MIN_QUOTE_AMOUNT) isValid = false;

            // 仅「我买U」(BUY) 时执行严格门槛过滤
            if (tradeType === "BUY") {
                if (STRATEGY_CONFIG.ALLOW_VERIFY_ORDER === false && isVerify === true) isValid = false;
                if (!isTradable) isValid = false;
            }

            return {
                商家名_merchant: o.advertiser?.nickName || "未知",
                汇率_price: parseFloat(o.adv.price),
                上限额度_max: maxAmt,
                要求验证单_requireVerify: isVerify,
                是否被判定为有效单_isValid: isValid
            };
        });

        let validOrders = details.filter(o => o.是否被判定为有效单_isValid);
        let depthResult = calculateDepthPrice(validOrders, isDescending, threshold, fallbackRank);

        return { ...base, success: true, rate: depthResult.rate, debug_summary: depthResult.summary, order_details: details };
    };

    const okxUrl = `https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=sell&paymentMethod=all&userType=all&limit=${STRATEGY_CONFIG.OKX_FETCH_LIMIT}`;

    const usdtReqs = [
        // —— 参考源：我卖U(买方盘口)。价格偏低，不进均价，仅供参考 ——
        fetchBinanceBook(
            "SELL",
            { id: "bin_sell", source: "Binance [我卖U/买方盘口]", role: "reference" },
            true,
            STRATEGY_CONFIG.BIN_SELL_CLUSTER_THRESHOLD,
            STRATEGY_CONFIG.BIN_SELL_FALLBACK_RANK,
            STRATEGY_CONFIG.BIN_SELL_FETCH_LIMIT || 20
        ),
        // —— 计算源：币安 我买U(卖方盘口) ——
        fetchBinanceBook(
            "BUY",
            { id: "bin_buy", source: "Binance [我买U/卖方盘口]", role: "price" },
            false,
            STRATEGY_CONFIG.BIN_BUY_CLUSTER_THRESHOLD,
            STRATEGY_CONFIG.BIN_BUY_FALLBACK_RANK,
            STRATEGY_CONFIG.BIN_BUY_FETCH_LIMIT || 200
        ),
        // —— 计算源：OKX 我买U(卖方盘口) ——
        makeReq(okxUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, { id: "okx_buy", source: "OKX [我买U/卖方盘口]", role: "price" }, d => {
            let rawOrders = d.data?.sell || [];
            let details = rawOrders.map(o => {
                let maxAmt = parseFloat(o.quoteMaxAmountPerOrder);
                let isVerify = o.verificationRequired === true;

                let isValid = true;
                if (STRATEGY_CONFIG.ALLOW_VERIFY_ORDER === false && isVerify === true) isValid = false;
                if (maxAmt <= STRATEGY_CONFIG.MIN_QUOTE_AMOUNT) isValid = false;

                return {
                    商家名_merchant: o.nickName,
                    汇率_price: parseFloat(o.price),
                    要求验证单_requireVerify: isVerify,
                    上限额度_max: maxAmt,
                    是否被判定为有效单_isValid: isValid
                };
            });

            let validOrders = details.filter(o => o.是否被判定为有效单_isValid);
            let depthResult = calculateDepthPrice(validOrders, false, STRATEGY_CONFIG.OKX_CLUSTER_THRESHOLD, STRATEGY_CONFIG.OKX_FALLBACK_RANK);

            return { rate: depthResult.rate, summary: depthResult.summary, details: details };
        }, STRATEGY_CONFIG.REQUEST_TIMEOUT)

        // —— 以后要加别的平台参考价，照上面 makeReq 复制一行，role 填 "reference" 即可 ——
    ];

    return await Promise.all(usdtReqs);
};
