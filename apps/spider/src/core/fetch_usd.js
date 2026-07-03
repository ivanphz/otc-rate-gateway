// src/core/fetch_usd.js
import { makeReq } from './utils.js';
import { STRATEGY_CONFIG } from './config.js';

export const getUsdRates = async () => {
    const timeout = STRATEGY_CONFIG.REQUEST_TIMEOUT;

    const usdReqs = [
        makeReq("https://api.exchangerate-api.com/v4/latest/USD", {}, { id: "er_api_1", source: "ER-API 1", role: "price" }, d => d.rates.CNY, timeout),
        makeReq("https://open.er-api.com/v6/latest/USD", {}, { id: "er_api_2", source: "ER-API 2", role: "price" }, d => d.rates.CNY, timeout),
        makeReq("https://www.floatrates.com/daily/usd.json", {}, { id: "floatrates", source: "FloatRates", role: "price" }, d => d.cny.rate, timeout),
        makeReq("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", {}, { id: "currencyapi", source: "CurrencyAPI", role: "price" }, d => d.usd.cny, timeout)
    ];

    return await Promise.all(usdReqs);
};
