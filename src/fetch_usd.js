// src/fetch_usd.js
import { makeReq } from './utils.js';
import { STRATEGY_CONFIG } from './config.js';

export const getUsdRates = async () => {
    const timeout = STRATEGY_CONFIG.REQUEST_TIMEOUT;
    
    const usdReqs =[
        makeReq("https://api.exchangerate-api.com/v4/latest/USD", {}, "ER-API 1", d => d.rates.CNY, timeout),
        makeReq("https://open.er-api.com/v6/latest/USD", {}, "ER-API 2", d => d.rates.CNY, timeout),
        makeReq("https://www.floatrates.com/daily/usd.json", {}, "FloatRates", d => d.cny.rate, timeout),
        makeReq("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", {}, "CurrencyAPI", d => d.usd.cny, timeout)
    ];

    return await Promise.all(usdReqs);
};