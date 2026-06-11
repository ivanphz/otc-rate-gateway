import express from 'express';
import cors from 'cors';
import { getUsdRates } from './fetch_usd.js';
import { getUsdtRates } from './fetch_usdt.js';

const app = express();

// 允许所有跨域请求，方便前端直接调用
app.use(cors());

// 根路由，处理原本 fetch 里的核心并发请求
app.get('/', async (req, res) => {
    try {
        const [usdData, usdtData] = await Promise.all([
            getUsdRates(),
            getUsdtRates()
        ]);

        res.json({
            usd_sources: usdData,
            usdt_sources: usdtData,
            serverTime: Date.now()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 监听 3000 端口
app.listen(3000, () => {
    console.log('OTC Rate API Server running on port 3000');
});