// src/server-entry.js  —— VPS / Docker 入口 (Express)
import express from 'express';
import cors from 'cors';
import { getUsdRates } from './core/fetch_usd.js';
import { getUsdtRates } from './core/fetch_usdt.js';

const app = express();
app.use(cors());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OTC Spider API running on port ${PORT}`);
});
