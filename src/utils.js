// src/utils.js
export const fetchWithTimeout = async (url, options, timeout = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err) {
        clearTimeout(id);
        throw new Error("Timeout");
    }
};

export const makeReq = async (url, options, sourceName, parser, timeout = 8000) => {
    try {
        const res = await fetchWithTimeout(url, options, timeout);
        const data = await res.json();
        const parsedResult = parser(data);
        
        if (typeof parsedResult === 'object' && parsedResult !== null) {
            return { 
                success: true, 
                source: sourceName, 
                rate: parsedResult.rate, 
                debug_summary: parsedResult.summary, 
                order_details: parsedResult.details 
            };
        }
        return { success: true, source: sourceName, rate: parseFloat(parsedResult) };
    } catch (e) {
        return { success: false, source: sourceName, error: e.message };
    }
};

export const calculateDepthPrice = (validOrders, sortDesc, threshold, fallbackRank) => {
    if (!validOrders || validOrders.length === 0) {
        return { rate: null, summary: "无有效单" };
    }

    let prices = validOrders.map(o => o.汇率_price).sort((a, b) => sortDesc ? b - a : a - b);
    
    let counts = {};
    for (let p of prices) {
        let key = p.toFixed(2);
        counts[key] = (counts[key] || 0) + 1;
    }

    let uniquePrices = [...new Set(prices.map(p => p.toFixed(2)))];
    let displayEntries = uniquePrices.slice(0, 8);
    
    let debugLog = displayEntries.map(k => `${k}有${counts[k]}单`).join(" | ");
    if (uniquePrices.length > 8) debugLog += " | ..."; 

    let finalRate = null;
    let found = false;
    let summary = "";

    for (let p of prices) {
        if (counts[p.toFixed(2)] >= threshold) {
            finalRate = parseFloat(p.toFixed(2));
            summary = `${debugLog} -> 满${threshold}单取:${finalRate}`;
            found = true;
            break;
        }
    }

    if (!found) {
        let fallbackIndex = Math.min(fallbackRank - 1, prices.length - 1);
        finalRate = prices[fallbackIndex];
        summary = `${debugLog} -> 无满${threshold}单,取第${fallbackIndex + 1}名:${finalRate}`;
    }

    return { rate: finalRate, summary: summary };
};