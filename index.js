const axios = require("axios");
const crypto = require("crypto");
const SYMBOL = "ETHUSDT";
const PERIODS = 50;
const RSI_PERIODS = 14;
const API_URL = "https://api.binance.com";
const API_KEY = "9DbqKEAIICwHKDTguuVUaj9UnAcoHYvWdBKFeP80hHBobquNYd4BhejbU2pwfKvH";
const API_SECRET = "QTPaGe10t45Z4lOsv8PItWiNLFRY9ffVd9gBqQNXPnk8WoADU52zlbWwQ66f3Yov";
const TRADE_AMOUNT = 0.01;
const POSITION_INCREMENTS = 4;
const POSITION_STEP = 0.015;
const PROFIT_STEP = 0.02;

let positions = [];

function signQuery(query) {
    return crypto.createHmac("sha256", API_SECRET).update(query).digest("hex");
}

async function placeOrder(side, quantity, price = null) {
    try {
        const timestamp = Date.now();
        let params = `symbol=${SYMBOL}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
        const signature = signQuery(params);
        const url = `${API_URL}/api/v3/order?${params}&signature=${signature}`;

        const { data } = await axios.post(url, {}, {
            headers: { "X-MBX-APIKEY": API_KEY }
        });
        console.log(`Ordem executada: ${side} ${quantity} ETH a preço de mercado`);
        return data;
    } catch (error) {
        console.error("Erro ao executar ordem:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function getMovingAverage() {
    try {
        const { data } = await axios.get(`${API_URL}/api/v3/klines?limit=${PERIODS}&interval=15m&symbol=${SYMBOL}`);
        const closingPrices = data.map(candle => parseFloat(candle[4]));
        return closingPrices.reduce((acc, price) => acc + price, 0) / PERIODS;
    } catch (error) {
        console.error("Erro ao buscar média móvel:", error.message);
        return null;
    }
}

async function getRSI() {
    try {
        const { data } = await axios.get(`${API_URL}/api/v3/klines?limit=${RSI_PERIODS + 1}&interval=15m&symbol=${SYMBOL}`);
        const closingPrices = data.map(candle => parseFloat(candle[4]));

        let gains = 0, losses = 0;
        for (let i = 1; i < closingPrices.length; i++) {
            let change = closingPrices[i] - closingPrices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / RSI_PERIODS;
        const avgLoss = losses / RSI_PERIODS;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    } catch (error) {
        console.error("Erro ao calcular RSI:", error.message);
        return null;
    }
}

async function start() {
    const movingAverage = await getMovingAverage();
    const rsi = await getRSI();

    if (movingAverage === null || rsi === null) {
        console.log("Erro ao obter dados, aguardando próxima execução...");
        return;
    }

    console.log("Média Móvel de 50 períodos:", movingAverage.toFixed(2));
    console.log("RSI:", rsi.toFixed(2));

    const BUY_PRICE = movingAverage * 0.99;

    try {
        const { data } = await axios.get(`${API_URL}/api/v3/klines?limit=1&interval=15m&symbol=${SYMBOL}`);
        const PRICE = parseFloat(data[0][4]);

        console.log("Preço Atual:", PRICE);
        console.log("Preço de Compra:", BUY_PRICE.toFixed(2));

        if (PRICE <= BUY_PRICE && rsi < 40 && positions.length < POSITION_INCREMENTS) {
            const order = await placeOrder("BUY", TRADE_AMOUNT);
            if (order) {
                positions.push({ price: PRICE, amount: TRADE_AMOUNT });
            }
        }

        for (let i = positions.length - 1; i >= 0; i--) {
            let position = positions[i];
            if (PRICE >= position.price * (1 + PROFIT_STEP)) {
                const order = await placeOrder("SELL", position.amount);
                if (order) {
                    positions.splice(i, 1);
                }
            }
        }

        console.log(`Posições abertas: ${positions.length}`);
    } catch (error) {
        console.error("Erro ao buscar preço atual:", error.message);
    }
}

setInterval(start, 10000);
 