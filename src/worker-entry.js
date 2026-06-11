import { getUsdRates } from './fetch_usd.js';
import { getUsdtRates } from './fetch_usdt.js';

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };
    
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const [usdData, usdtData] = await Promise.all([
            getUsdRates(),
            getUsdtRates()
        ]);
        return new Response(JSON.stringify({
            usd_sources: usdData,
            usdt_sources: usdtData,
            serverTime: Date.now()
        }, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};