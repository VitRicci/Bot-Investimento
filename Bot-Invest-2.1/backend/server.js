const express = require('express');
const cors = require('cors');
const Binance = require('binance-api-node').default;
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./trades.db');

// Criação da tabela de trades, se não existir
db.run(`CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT,
  valor REAL,
  data TEXT,
  acao TEXT,
  quantidade REAL
)`);

// Criação da tabela de metas, se não existir
db.run(`CREATE TABLE IF NOT EXISTS metas (
  acao TEXT PRIMARY KEY,
  lucro REAL,
  prejuizo REAL
)`);

// Substitua pelas suas chaves da testnet
const client = Binance({
  apiKey: 'M76F1QnyReCrfxPuQcgoFkTEdWVu87xq6N0sPyvQdnPzFm5P379ysBjFmiplP44P',
  apiSecret: 'LkJy0i105nllgHR3MxdLKN2ZTCno9MsZYxWq6FUgvlTcf7bgcAmMYzRbtFikOOZV',
  httpBase: 'https://testnet.binance.vision', // CERTO!
});

// Função para comprar na testnet
async function comprarBinance(symbol, quantity) {
  try {
    const order = await client.order({
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity,
    });
    console.log('Compra executada:', order);
    return order;
  } catch (err) {
    console.error('Erro ao comprar:', err.body || err);
    throw err;
  }
}

// Função para vender na testnet
async function venderBinance(symbol, quantity) {
  try {
    const order = await client.order({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity,
    });
    console.log('Venda executada:', order);
    return order;
  } catch (err) {
    console.error('Erro ao vender:', err.body || err);
    throw err;
  }
}

// Endpoint para comprar na Binance Testnet
app.post('/binance/comprar', async (req, res) => {
  const { symbol, quantity } = req.body;
  try {
    const order = await client.order({
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity,
    });
    // Registra trade no banco
    db.run(
      `INSERT INTO trades (tipo, valor, data, acao, quantidade) VALUES (?, ?, ?, ?, ?)`,
      [
        'COMPRA',
        parseFloat(order.fills[0].price),
        new Date().toISOString(),
        symbol.replace('USDT', ''),
        parseFloat(quantity)
      ]
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.body || err.message });
  }
});

// Venda na Binance Testnet e registra trade
app.post('/binance/vender', async (req, res) => {
  const { symbol, quantity } = req.body;
  try {
    const order = await client.order({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity,
    });

    // Calcular preço médio de compra para o ativo vendido
    db.all(
      `SELECT * FROM trades WHERE acao = ? AND tipo = 'COMPRA' ORDER BY data ASC`,
      [symbol.replace('USDT', '')],
      (err, compras) => {
        let qtdRestante = parseFloat(quantity);
        let custoTotal = 0;
        for (const compra of compras) {
          if (qtdRestante <= 0) break;
          const qtdUsada = Math.min(qtdRestante, compra.quantidade);
          custoTotal += qtdUsada * compra.valor;
          qtdRestante -= qtdUsada;
        }
        // Registra trade de venda com custo
        db.run(
          `INSERT INTO trades (tipo, valor, data, acao, quantidade, custo) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            'VENDA',
            parseFloat(order.fills[0].price),
            new Date().toISOString(),
            symbol.replace('USDT', ''),
            parseFloat(quantity),
            custoTotal
          ]
        );
      }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.body || err.message });
  }
});

// Endpoint para consultar lucro e prejuízo
app.get('/financeiro', (req, res) => {
  db.all('SELECT * FROM trades', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let investido = 0, lucro = 0, prejuizo = 0, saldo = 0;
    rows.forEach(t => {
      if (t.tipo === 'COMPRA') {
        investido += t.valor * t.quantidade;
        saldo -= t.valor * t.quantidade;
      } else if (t.tipo === 'VENDA') {
        saldo += t.valor * t.quantidade;
        if (t.custo !== undefined && t.custo !== null) {
          const resultado = (t.valor * t.quantidade) - t.custo;
          if (resultado >= 0) lucro += resultado;
          else prejuizo += Math.abs(resultado);
        }
      }
    });
    res.json({ investido, lucro, prejuizo, saldo });
  });
});

app.get('/trades', (req, res) => {
  db.all('SELECT * FROM trades ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint para registrar uma nova trade
app.post('/trades', (req, res) => {
  const { tipo, valor, data, acao, quantidade } = req.body;
  db.run(
    `INSERT INTO trades (tipo, valor, data, acao, quantidade) VALUES (?, ?, ?, ?, ?)`,
    [tipo, valor, data, acao, quantidade],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'Trade registrada', id: this.lastID });
    }
  );
});

// Endpoint para consultar saldo
app.get('/binance/saldo', async (req, res) => {
  try {
    const accountInfo = await client.accountInfo();
    res.json(accountInfo.balances);
  } catch (err) {
    res.status(500).json({ error: err.body || err.message });
  }
});

// Endpoint para consultar ordens abertas
app.get('/binance/ordens', async (req, res) => {
  try {
    const openOrders = await client.openOrders();
    res.json(openOrders);
  } catch (err) {
    res.status(500).json({ error: err.body || err.message });
  }
});

// --- Mini-bot automatizado para Testnet ---
let botAtivo = false;
let botConfig = {};

// Variáveis de controle indexadas por par
let ultimosPrecos = {};      // Ex: ultimosPrecos[PAR]
let precosCompra = {};       // Ex: precosCompra[PAR]
let historicoPrecos = {};    // Ex: historicoPrecos[PAR]
let stopLossAtivado = {};    // Ex: stopLossAtivado[PAR]
let operacoesHoje = {};      // Ex: operacoesHoje[PAR]
let dataUltimaOperacao = {}; // Ex: dataUltimaOperacao[PAR]

// Função para resetar operações diárias por par
function resetarOperacoesDiarias(PAR) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (hoje !== dataUltimaOperacao[PAR]) {
    operacoesHoje[PAR] = 0;
    dataUltimaOperacao[PAR] = hoje;
  }
}

// Função de média móvel por par
function mediaMovel(PAR, n = 5) {
  const arr = historicoPrecos[PAR] || [];
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// Função para definir a quantidade personalizada (chame no endpoint /iniciar)
function definirQuantidadePersonalizada(qtd) {
  if (qtd && !isNaN(qtd) && qtd > 0) {
    quantidadePersonalizada = qtd;
  }
}

// Função de log detalhado (salva no console e pode ser adaptada para arquivo)
function logDetalhado(msg) {
  const texto = `[${new Date().toISOString()}] ${msg}`;
  console.log(texto);
  // Para salvar em arquivo, descomente a linha abaixo:
  // require('fs').appendFileSync('./logs/bot.log', texto + '\n');
}

// Loop do bot usando WebSocket para preços
async function botLoop() {
  if (!botAtivo || !botConfig.pares) return;
  for (const PAR of botConfig.pares) {
    // Inicialize variáveis por par se necessário
    if (!ultimosPrecos[PAR]) ultimosPrecos[PAR] = null;
    if (!precosCompra[PAR]) precosCompra[PAR] = null;
    if (!historicoPrecos[PAR]) historicoPrecos[PAR] = [];
    if (!operacoesHoje[PAR]) operacoesHoje[PAR] = 0;
    if (!dataUltimaOperacao[PAR]) dataUltimaOperacao[PAR] = '';
    if (!stopLossAtivado[PAR]) stopLossAtivado[PAR] = false;

    resetarOperacoesDiarias(PAR);

    try {
      if (operacoesHoje[PAR] >= (botConfig.limiteDiario || 10)) {
        logDetalhado(`[BOT] Limite diário de operações atingido (${operacoesHoje[PAR]}/${botConfig.limiteDiario || 10}).`);
        return;
      }

      const precoAtual = wsPrices[PAR];
      if (!precoAtual) {
        logDetalhado(`[BOT] Sem preço atual para ${PAR}, aguardando WebSocket...`);
        continue;
      }
      if (!ultimosPrecos[PAR]) ultimosPrecos[PAR] = precoAtual;

      const quantidadeOperacao = quantidadePersonalizada || botConfig.quantidade;

      logDetalhado(`[BOT] ${PAR} Preço atual: ${precoAtual}, Último: ${ultimosPrecos[PAR]}, Compra: ${precosCompra[PAR]}`);

      historicoPrecos[PAR].push(precoAtual);
      if (historicoPrecos[PAR].length > 20) historicoPrecos[PAR].shift();

      const mm = mediaMovel(PAR, 5);
      if (mm && precoAtual < mm) {
        logDetalhado(`[BOT] ${PAR} ignorado, preço abaixo da média móvel (${precoAtual} < ${mm.toFixed(2)})`);
        continue;
      }

      let saldoUSDT = 0;
      try {
        const saldo = await client.accountInfo();
        saldoUSDT = parseFloat(saldo.balances.find(b => b.asset === 'USDT')?.free || 0);
      } catch (err) {
        logDetalhado(`[BOT] Erro ao buscar saldo: ${err.message}`);
        continue;
      }
      const maxPorOperacao = saldoUSDT * ((botConfig.maxPorOperacaoPercent || 20) / 100);
      if (quantidadeOperacao * precoAtual > maxPorOperacao) {
        logDetalhado(`[BOT] Saldo insuficiente para comprar ${quantidadeOperacao} de ${PAR}. Saldo USDT: ${saldoUSDT}, necessário: ${(quantidadeOperacao * precoAtual).toFixed(2)}`);
        continue;
      }

      // Compra
      if (!precosCompra[PAR] && precoAtual < ultimosPrecos[PAR] * (1 - botConfig.queda / 100)) {
        try {
          await client.order({
            symbol: PAR,
            side: 'BUY',
            type: 'MARKET',
            quantity: quantidadeOperacao
          });
          precosCompra[PAR] = precoAtual;
          ultimosPrecos[PAR] = precoAtual; // Atualiza só após compra!
          logDetalhado(`[BOT] COMPRA: ${quantidadeOperacao} ${PAR} a ${precoAtual} (Aguardar venda para calcular lucro/prejuízo)`);
          operacoesHoje[PAR]++;
        } catch (err) {
          logDetalhado(`[BOT] ERRO AO COMPRAR ${PAR}: ${err.body || err.message}`);
        }
      }
      // Venda
      else if (
        precosCompra[PAR] &&
        (
          (botConfig.lucroFixo && precoAtual - precosCompra[PAR] >= botConfig.lucroFixo) ||
          (precoAtual > precosCompra[PAR] * (1 + botConfig.alta / 100))
        )
      ) {
        try {
          const lucro = precoAtual - precosCompra[PAR];
          const resultado = lucro * quantidadeOperacao;
          await client.order({
            symbol: PAR,
            side: 'SELL',
            type: 'MARKET',
            quantity: quantidadeOperacao
          });
          ultimosPrecos[PAR] = precoAtual; // Atualiza só após venda!
          logDetalhado(`[BOT] VENDA: ${quantidadeOperacao} ${PAR} a ${precoAtual} | Lucro/prejuízo: ${resultado >= 0 ? 'Lucro' : 'Prejuízo'} de ${resultado.toFixed(4)} USDT`);
          precosCompra[PAR] = null;
          operacoesHoje[PAR]++;
        } catch (err) {
          logDetalhado(`[BOT] ERRO AO VENDER ${PAR}: ${err.body || err.message}`);
        }
      }
      // Stop Loss
      else if (
        precosCompra[PAR] &&
        (
          (botConfig.prejuizoFixo && precosCompra[PAR] - precoAtual >= botConfig.prejuizoFixo) ||
          (precoAtual < precosCompra[PAR] * (1 - (botConfig.stopLossPercent || 2) / 100))
        )
      ) {
        try {
          const prejuizo = precoAtual - precosCompra[PAR];
          const resultado = prejuizo * quantidadeOperacao;
          await client.order({
            symbol: PAR,
            side: 'SELL',
            type: 'MARKET',
            quantity: quantidadeOperacao
          });
          ultimosPrecos[PAR] = precoAtual; // Atualiza só após stop!
          logDetalhado(`[BOT] STOP LOSS: ${quantidadeOperacao} ${PAR} a ${precoAtual} | Prejuízo: ${resultado.toFixed(4)} USDT`);
          precosCompra[PAR] = null;
          operacoesHoje[PAR]++;
        } catch (err) {
          logDetalhado(`[BOT] ERRO NO STOP LOSS DE ${PAR}: ${err.body || err.message}`);
        }
      } else {
        // Não atualize ultimosPrecos aqui!
        logDetalhado(`[BOT] Nenhuma operação para ${PAR} neste ciclo.`);
      }
      ultimosPrecos[PAR] = precoAtual;

      // Verifica se possui o ativo (precosCompra[PAR] !== null) e se o preço atual é maior que o preço de compra
      if (precosCompra[PAR] !== null && wsPrices[PAR]) {
        const precoAtual = wsPrices[PAR];
        const precoCompra = precosCompra[PAR];
        const quantidadeOperacao = quantidadePersonalizada || botConfig.quantidade;
        const lucroEstimado = (precoAtual - precoCompra) * quantidadeOperacao;
        const prejuizoEstimado = (precoCompra - precoAtual) * quantidadeOperacao;

        // Só vende se o lucro estimado for maior que o prejuízo estimado
        if (lucroEstimado > prejuizoEstimado && lucroEstimado > 0) {
          try {
            await venderBinance(PAR, quantidadeOperacao);
            logDetalhado(`Venda automática de ${PAR} por lucro: Comprado a ${precoCompra}, vendendo a ${precoAtual}, lucro estimado: ${lucroEstimado.toFixed(4)} USDT`);
            precosCompra[PAR] = null; // Zera o controle para não vender de novo
          } catch (err) {
            logDetalhado(`Erro ao vender ${PAR} automaticamente: ${err.message || err}`);
          }
        }
      }
    } catch (err) {
      logDetalhado('[BOT] ERRO GERAL NO LOOP: ' + (err.body || err.message));
    }
  }
  setTimeout(botLoop, botConfig.intervalo || 10000);
}

// Endpoints para iniciar/parar o bot
let botInterval = null; // variável global para o intervalo do loop

app.post('/iniciar', (req, res) => {
  botConfig = req.body;
  botConfig.stopLossPercent = req.body.stopLossPercent || 2;
  botAtivo = true;

  if (botInterval) clearInterval(botInterval);
  fecharWebSockets(); // Fecha conexões antigas antes de abrir novas
  wsPrices = {};
  ultimosPrecos = {};
  precosCompra = {};
  historicoPrecos = {};
  quantidadePersonalizada = null;

  iniciarWebSocket(botConfig.pares);

  logDetalhado('[BOT] Bot automatizado INICIADO e estado limpo!');
  botInterval = setInterval(() => {
    if (botAtivo) botLoop();
  }, botConfig.intervalo || 10000);

  res.json({ status: 'Bot automatizado iniciado!', config: botConfig });
});
app.post('/parar', (req, res) => {
  botAtivo = false;
  if (botInterval) clearInterval(botInterval);
  botInterval = null;
  fecharWebSockets(); // Fecha todas as conexões WebSocket
  // Limpa variáveis globais do bot
  wsPrices = {};
  ultimosPrecos = {};
  precosCompra = {};
  historicoPrecos = {};
  quantidadePersonalizada = null;
  logDetalhado('[BOT] Bot automatizado PARADO e estado limpo!');
  res.json({ status: 'Bot automatizado parado!' });
});
app.get('/status', (req, res) => {
  res.json({ status: botAtivo ? 'ok' : 'parado', config: botConfig });
});

app.get('/historico-acoes', (req, res) => {
  db.all('SELECT * FROM trades ORDER BY data ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint para listar metas
app.get('/metas', (req, res) => {
  db.all('SELECT * FROM metas', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint para salvar/atualizar meta
app.post('/meta', (req, res) => {
  const { acao, lucro, prejuizo } = req.body;
  db.run(
    `INSERT INTO metas (acao, lucro, prejuizo) VALUES (?, ?, ?)
     ON CONFLICT(acao) DO UPDATE SET lucro=excluded.lucro, prejuizo=excluded.prejuizo`,
    [acao, lucro, prejuizo],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'Meta salva', acao, lucro, prejuizo });
    }
  );
});

app.listen(3000, () => console.log('Backend rodando na porta 3000 (Testnet Binance)'));

// Captura de exceções não tratadas
process.on('uncaughtException', err => { console.error(err); });

/* Código do cliente para consumir a API
(async () => {
    const res = await fetch('http://localhost:3000/financeiro');
    const data = await res.json();
    console.log(data);
})();
*/

db.run(`ALTER TABLE trades ADD COLUMN custo REAL`, err => {
  // Ignora erro se a coluna já existe
});

let wsConnections = [];
let wsPrices = {};

function iniciarWebSocket(pares, onPrice) {
  // Fecha conexões antigas
  wsConnections.forEach(ws => { try { ws.close(); } catch {} });
  wsConnections = [];
  wsPrices = {};

  pares.forEach(PAR => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${PAR.toLowerCase()}@trade`);
    ws.on('message', (data) => {
      const trade = JSON.parse(data);
      wsPrices[trade.s] = parseFloat(trade.p);
      if (onPrice) onPrice(trade.s, wsPrices[trade.s]);
    });
    ws.on('error', err => console.error(`[WebSocket] ${PAR}:`, err.message));
    wsConnections.push(ws);
  });
}

function fecharWebSockets() {
  wsConnections.forEach(ws => { try { ws.close(); } catch {} });
  wsConnections = [];
}

function getPrice(symbol) {
  return wsPrices[symbol];
}

app.post('/resetar-lucro', (req, res) => {
  db.run('DELETE FROM trades', err => {
    if (err) return res.status(500).json({ status: 'Erro ao resetar lucro/prejuízo.' });
    res.json({ status: 'Lucro/prejuízo resetado!' });
  });
});