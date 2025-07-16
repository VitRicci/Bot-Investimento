let graficoAcoes = null;
let graficoFinanceiro = null;
let saldoAtivos = [];
let saldoColapsado = false;

const NOTIONAL_MINIMO = 10; // valor mínimo em USDT para ordem

async function atualizarTrades() {
    try {
        const res = await fetch('http://localhost:3000/trades');
        const trades = await res.json();
        const tbody = document.getElementById('trades-tbody');
        tbody.innerHTML = '';
        trades.forEach(trade => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${trade.id}</td>
                <td>${trade.tipo}</td>
                <td>R$${parseFloat(trade.valor).toFixed(2)}</td>
                <td>${new Date(trade.data).toLocaleString()}</td>
                <td>${trade.acao}</td>
                <td>${trade.quantidade}</td>`;
            tbody.appendChild(tr);
        });
    } catch {
        const tbody = document.getElementById('trades-tbody');
        tbody.innerHTML = '<tr><td colspan="6">Erro ao carregar trades</td></tr>';
    }
}

async function atualizarStatus() {
    const res = await fetch('http://localhost:3000/status');
    const data = await res.json();
    document.getElementById('status').innerText = data.botAtivo ? 'Bot rodando...' : 'Bot parado';
    const element = document.getElementById('saldo');
    if (data.saldo !== undefined && data.saldo !== null) {
        element.innerText = "Saldo: R$" + Number(data.saldo).toFixed(2);
    } else {
        element.innerText = "Saldo: --";
    }
}

async function atualizarGraficoAcoes() {
    const res = await fetch('http://localhost:3000/historico-acoes');
    const dados = await res.json();
    // Agrupa por ação
    const acoes = {};
    dados.forEach(d => {
        if (!acoes[d.acao]) acoes[d.acao] = [];
        acoes[d.acao].push({ data: d.data, valor: d.valor });
    });
    // Monta datasets para Chart.js
    const datasets = [];
    let tendenciaHtml = '';
    Object.keys(acoes).forEach(acao => {
        const valores = acoes[acao].map(v => v.valor);
        const labels = acoes[acao].map(v => new Date(v.data).toLocaleTimeString());
        const cor = '#' + Math.floor(Math.random()*16777215).toString(16);
        datasets.push({
            label: acao,
            data: valores,
            borderColor: cor,
            backgroundColor: cor + '33',
            fill: false,
            tension: 0.2
        });
        // Indicativo de tendência
        if (valores.length > 1) {
            const tendencia = valores[valores.length-1] > valores[0] ? '⬆️ Subindo' : '⬇️ Descendo';
            tendenciaHtml += `<b>${acao}:</b> ${tendencia}<br>`;
        }
    });
    if (graficoAcoes) graficoAcoes.destroy();
    const canvas = document.getElementById('grafico-acoes');
if (!canvas) return; // Evita erro se o elemento não existir
const ctx = canvas.getContext('2d');
    graficoAcoes = new Chart(ctx, {
        type: 'line',
        data: { labels: dados.map(d => new Date(d.data).toLocaleTimeString()), datasets },
        options: { responsive: true, plugins: { legend: { display: true } } }
    });
    document.getElementById('tendencia').innerHTML = tendenciaHtml;
}

async function atualizarGraficoFinanceiro() {
    const res = await fetch('http://localhost:3000/financeiro');
    const { investido, lucro, prejuizo, saldo } = await res.json();
    if (graficoFinanceiro) graficoFinanceiro.destroy();
    const canvas = document.getElementById('grafico-financeiro');
if (!canvas) return; // Evita erro se o elemento não existir
const ctx = canvas.getContext('2d');
    graficoFinanceiro = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Investido', 'Lucro', 'Prejuízo', 'Saldo'],
            datasets: [{
                label: 'R$',
                data: [investido, lucro, prejuizo, saldo],
                backgroundColor: ['#1976d2', '#388e3c', '#c62828', '#ffa000']
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

document.getElementById('iniciar-btn').onclick = async function() {
    const res = await fetch('http://localhost:3000/iniciar', { method: 'POST' });
    const data = await res.json();
    alert(data.status || 'Bot iniciado!');
};

document.getElementById('parar-btn').onclick = async function() {
    const res = await fetch('http://localhost:3000/parar', { method: 'POST' });
    const data = await res.json();
    alert(data.status || 'Bot parado!');
};

async function atualizarMiniPainelFinanceiro() {
    const res = await fetch('http://localhost:3000/financeiro');
    const { investido, lucro, prejuizo } = await res.json();
    document.getElementById('mini-investido').innerText = investido.toFixed(2);
    document.getElementById('mini-lucro').innerText = lucro.toFixed(2);
    document.getElementById('mini-prejuizo').innerText = prejuizo.toFixed(2);
}

// Chame essa função junto com as outras atualizações:
setInterval(atualizarMiniPainelFinanceiro, 5000);
atualizarMiniPainelFinanceiro();

async function atualizarTudo() {
    await atualizarStatus();
    await atualizarGraficoAcoes();
    await atualizarGraficoFinanceiro();
    await atualizarTrades();
}
atualizarTudo();
setInterval(atualizarTudo, 5000);

document.getElementById('reset-dia-btn').onclick = async () => {
    if (confirm('Deseja realmente resetar os gráficos do dia?')) {
        const res = await fetch('http://localhost:3000/reset-dia', { method: 'POST' });
        const data = await res.json();
        alert(data.message + ` (${data.changes} registros apagados)`);
        atualizarTudo();
    }
};

document.getElementById('reset-total-btn').onclick = async () => {
    if (confirm('ATENÇÃO: Isso irá apagar TODO o histórico de trades. Deseja continuar?')) {
        const res = await fetch('http://localhost:3000/reset-total', { method: 'POST' });
        const data = await res.json();
        alert(data.message + ` (${data.changes} registros apagados)`);
        atualizarTudo();
    }
};

// Calcula preço médio de compra por ação até o momento da venda
function calcularPrecoMedio(trades, acao, vendaIndex) {
    let qtd = 0, total = 0;
    for (let i = 0; i < vendaIndex; i++) {
        const t = trades[i];
        if (t.acao === acao) {
            if (t.tipo === 'COMPRA') {
                qtd += t.quantidade;
                total += t.valor * t.quantidade;
            }
            if (t.tipo === 'VENDA') {
                qtd -= t.quantidade;
                // Não altera o total, pois só compras afetam o preço médio
            }
        }
    }
    return qtd > 0 ? total / qtd : 0;
}

async function atualizarTabelas() {
    const res = await fetch('http://localhost:3000/trades');
    const trades = await res.json();

    // Calcula quantidade e preço médio por ação
    const acoes = {};
    trades.forEach(trade => {
        if (!acoes[trade.acao]) acoes[trade.acao] = { qtd: 0, total: 0, compras: [] };
        if (trade.tipo === 'COMPRA') {
            acoes[trade.acao].qtd += trade.quantidade;
            acoes[trade.acao].total += trade.valor * trade.quantidade;
            acoes[trade.acao].compras.push(trade);
        }
        if (trade.tipo === 'VENDA') {
            acoes[trade.acao].qtd -= trade.quantidade;
        }
    });

    // Painel dinâmico de ações
    let painelHtml = '';
    Object.keys(acoes).forEach(acao => {
        const info = acoes[acao];
        if (info.qtd > 0) {
            const precoMedio = (info.total / info.qtd).toFixed(2);
            painelHtml += `
                <div class="acao-badge" data-acao="${acao}">
                    ${acao}: ${info.qtd}
                    <button class="btn-vender" onclick="venderAcao('${acao}', 1)">Vender 1</button>
                    <button class="btn-vender" onclick="venderAcao('${acao}', ${Math.floor(info.qtd/2)})" ${info.qtd<2?'disabled':''}>½</button>
                    <button class="btn-vender" onclick="venderAcao('${acao}', ${info.qtd})">Tudo</button>
                    <span class="tooltip">
                        Preço médio: R$${precoMedio}<br>
                        Última compra: ${info.compras.length ? new Date(info.compras[info.compras.length-1].data).toLocaleString() : '-'}
                    </span>
                </div>
            `;
        }
    });
    document.getElementById('painel-acoes').innerHTML = painelHtml || '<i>Nenhuma ação comprada.</i>';

    // Compras
    const compras = trades.filter(trade => trade.tipo === 'COMPRA');
    const comprasTbody = document.getElementById('compras-tbody');
    comprasTbody.innerHTML = '';
    compras.forEach(trade => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${trade.acao}</td>
            <td>R$${parseFloat(trade.valor).toFixed(2)}</td>
            <td>${trade.quantidade}</td>
            <td>${new Date(trade.data).toLocaleString()}</td>
            <td><button class="btn-vender" onclick="venderAcao('${trade.acao}', 1)">Vender 1</button></td>
        `;
        comprasTbody.appendChild(tr);
    });

    // Vendas
    const vendasTbody = document.getElementById('vendas-tbody');
    vendasTbody.innerHTML = '';
    trades.forEach((trade, idx) => {
        if (trade.tipo === 'VENDA') {
            const precoMedio = calcularPrecoMedio(trades, trade.acao, idx);
            const lucro = (trade.valor - precoMedio) * trade.quantidade;
            const perc = precoMedio > 0 ? ((trade.valor - precoMedio) / precoMedio * 100).toFixed(2) : "0.00";
            const lucroClass = lucro >= 0 ? 'lucro-positivo' : 'lucro-negativo';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${trade.acao}</td>
                <td>R$${parseFloat(trade.valor).toFixed(2)}</td>
                <td>${trade.quantidade}</td>
                <td>${new Date(trade.data).toLocaleString()}</td>
                <td class="${lucroClass}">
                    ${lucro >= 0 ? 'Lucro' : 'Prejuízo'}: R$${lucro.toFixed(2)} (${perc}%)
                </td>
            `;
            vendasTbody.appendChild(tr);
        }
    });

    // Todos os trades
    const tradesTbody = document.getElementById('trades-tbody');
    tradesTbody.innerHTML = '';
    trades.forEach(trade => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${trade.id}</td>
            <td>${trade.tipo}</td>
            <td>${trade.acao}</td>
            <td>R$${parseFloat(trade.valor).toFixed(2)}</td>
            <td>${trade.quantidade}</td>
            <td>${new Date(trade.data).toLocaleString()}</td>
        `;
        tradesTbody.appendChild(tr);
    });
}

async function atualizarPainelAcoes() {
    const res = await fetch('http://localhost:3000/trades');
    const trades = await res.json();

    // Calcula quantidade, preço médio e valor atual por ação
    const acoes = {};
    trades.forEach(trade => {
        if (!acoes[trade.acao]) acoes[trade.acao] = { qtd: 0, total: 0, compras: [], ultValor: null };
        if (trade.tipo === 'COMPRA') {
            acoes[trade.acao].qtd += trade.quantidade;
            acoes[trade.acao].total += trade.valor * trade.quantidade;
            acoes[trade.acao].compras.push(trade);
        }
        if (trade.tipo === 'VENDA') {
            acoes[trade.acao].qtd -= trade.quantidade;
        }
        // Último valor negociado
        acoes[trade.acao].ultValor = trade.valor;
    });

    let painelHtml = '';
    Object.keys(acoes).forEach(acao => {
        const info = acoes[acao];
        if (info.qtd > 0) {
            const precoMedio = (info.total / info.qtd).toFixed(2);
            const valorAtual = info.ultValor ? info.ultValor : precoMedio;
            const lucroPorAcao = valorAtual - precoMedio;
            const lucroTotal = lucroPorAcao * info.qtd;
            const perc = precoMedio > 0 ? ((lucroPorAcao / precoMedio) * 100).toFixed(2) : "0.00";
            const lucroClass = lucroTotal >= 0 ? 'lucro-positivo' : 'lucro-negativo';

            painelHtml += `
                <div class="acao-badge" data-acao="${acao}">
                    ${acao}: ${info.qtd}
                    <span style="margin-left:10px; font-size:0.95em;">
                        <span title="Preço médio">PM: R$${precoMedio}</span> |
                        <span title="Valor atual">Atual: R$${valorAtual}</span> |
                        <span class="${lucroClass}" title="Lucro/prejuízo total">
                            ${lucroTotal >= 0 ? 'Lucro' : 'Prejuízo'}: R$${lucroTotal.toFixed(2)} (${perc}%)
                        </span>
                    </span>
                    <button class="btn-vender" onclick="venderAcao('${acao}', ${info.qtd}, ${valorAtual})">Vender tudo</button>
                </div>
            `;
        }
    });
    document.getElementById('painel-acoes').innerHTML = painelHtml || '<i>Nenhuma ação comprada.</i>';
}

// Função global para vender todas as ações de uma empresa pelo valor atual
window.venderAcao = async function(acao, quantidade, valor) {
    const symbol = acao + 'USDT'; // Ajuste conforme necessário
    if (!quantidade || quantidade <= 0) {
        alert('Quantidade inválida!');
        return;
    }
    if (!confirm(`Deseja vender ${quantidade} de ${acao} por R$${valor.toFixed(2)} cada?`)) return;
    try {
        const res = await fetch('http://localhost:3000/binance/vender', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: symbol,
                quantity: quantidade
            })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Venda enviada para a Binance Testnet!\n' + JSON.stringify(data, null, 2));
        } else {
            alert('Erro ao vender: ' + (data.error || JSON.stringify(data)));
        }
    } catch (e) {
        alert('Erro de conexão com o backend.');
    }
    atualizarTabelas && atualizarTabelas();
};

window.comprarAcao = async function(acao, quantidade, valor) {
    // Use o símbolo correto da Binance Testnet, ex: BTCUSDT
    const symbol = acao + 'USDT'; // Ajuste conforme necessário
    if (!quantidade || quantidade <= 0) {
        alert('Quantidade inválida!');
        return;
    }
    try {
        const res = await fetch('http://localhost:3000/binance/comprar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: symbol,
                quantity: quantidade
            })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Compra enviada para a Binance Testnet!\n' + JSON.stringify(data, null, 2));
        } else {
            alert('Erro ao comprar: ' + (data.error || JSON.stringify(data)));
        }
    } catch (e) {
        alert('Erro de conexão com o backend.');
    }
    atualizarTabelas && atualizarTabelas();
}

// Atualiza o painel de saldo por ativo
async function atualizarSaldo() {
  try {
    const res = await fetch('http://localhost:3000/binance/saldo');
    const saldo = await res.json();
    saldoAtivos = saldo.filter(s => parseFloat(s.free) > 0 && s.asset !== 'USDT');
    let html = '';
    if (!saldoColapsado) {
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      saldoAtivos.forEach(s => {
        html += `
          <div style="
            background:#e3f2fd;
            border-radius:6px;
            padding:8px 14px;
            min-width:70px;
            text-align:center;
            box-shadow:0 1px 4px #0001;
            font-size:0.98em;
            margin-bottom:4px;
          ">
            <div style="font-weight:600;color:#1976d2;">${s.asset}</div>
            <div style="font-size:1.1em;">${parseFloat(s.free).toFixed(4)}</div>
          </div>
        `;
      });
      html += '</div>';
    }
    document.getElementById('painel-saldo').innerHTML = html;
    calcularLucroPrejuizoTodos();
  } catch {
    document.getElementById('painel-saldo').innerHTML = '<i>Erro ao carregar saldo.</i>';
    document.getElementById('lucro-prejuizo-todos').innerText = '';
  }
}

// Colapsar/expandir painel saldo
document.getElementById('toggle-saldo-btn').onclick = function() {
  saldoColapsado = !saldoColapsado;
  atualizarSaldo();
};

// Vender todos os ativos
document.getElementById('vender-todos-btn').onclick = async function() {
  if (!saldoAtivos.length) {
    alert('Nenhum ativo para vender.');
    return;
  }
  if (!confirm('Deseja vender TODOS os ativos?')) return;
  for (const ativo of saldoAtivos) {
    const symbol = ativo.asset + 'USDT';
    const quantidade = parseFloat(ativo.free);
    if (!parTestnetValido(symbol)) continue;
    // Busca preço de mercado para calcular notional
    const precoMercado = await getPrecoMercado(symbol);
    if (!precoMercado || quantidade * precoMercado < NOTIONAL_MINIMO) continue; // pula se não atingir mínimo
    try {
      const res = await fetch('http://localhost:3000/binance/vender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, quantity: quantidade })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erro ao vender ${ativo.asset}: ` + (data.error || JSON.stringify(data)));
      }
    } catch (e) {
      alert(`Erro de conexão ao vender ${ativo.asset}.`);
    }
  }
  setTimeout(() => {
    atualizarSaldo();
    calcularLucroPrejuizoTodos();
  }, 1500);
};

// Calcula lucro/prejuízo estimado da venda de todos os ativos
async function calcularLucroPrejuizoTodos() {
  try {
    const resTrades = await fetch('http://localhost:3000/trades');
    const trades = await resTrades.json();
    let totalLucro = 0, totalPrejuizo = 0;
    const promessas = saldoAtivos.map(async ativo => {
      const compras = trades.filter(t => t.acao === ativo.asset && t.tipo === 'COMPRA');
      let qtdComprada = compras.reduce((acc, t) => acc + t.quantidade, 0);
      let qtdAtual = parseFloat(ativo.free);
      let precoMedio = qtdComprada > 0 ? compras.reduce((acc, t) => acc + t.valor * t.quantidade, 0) / qtdComprada : 0;
      const symbol = ativo.asset + 'USDT';
      const precoMercado = await getPrecoMercado(symbol) || precoMedio;
      const resultado = (precoMercado - precoMedio) * qtdAtual;
      if (resultado >= 0) totalLucro += resultado;
      else totalPrejuizo += Math.abs(resultado);
    });
    await Promise.all(promessas);
    let texto = '';
    if (totalLucro > 0) texto += `Lucro estimado: R$ ${totalLucro.toFixed(2)} `;
    if (totalPrejuizo > 0) texto += `Prejuízo estimado: R$ ${totalPrejuizo.toFixed(2)}`;
    document.getElementById('lucro-prejuizo-todos').innerText = texto || '';
  } catch {
    document.getElementById('lucro-prejuizo-todos').innerText = '';
  }
}

// Atualize o painel de saldo e lucro/prejuízo ao vivo
setInterval(() => {
  atualizarSaldo();
  calcularLucroPrejuizoTodos();
}, 5000);
atualizarSaldo();
calcularLucroPrejuizoTodos();

// Salva configurações no localStorage
function salvarConfigBot() {
  const config = {
    pares: document.getElementById('bot-pares').value,
    quantidade: document.getElementById('bot-quantidade').value,
    queda: document.getElementById('bot-queda').value,
    alta: document.getElementById('bot-alta').value,
    intervalo: document.getElementById('bot-intervalo').value
  };
  localStorage.setItem('configBot', JSON.stringify(config));
}

// Carrega configurações do localStorage
function carregarConfigBot() {
  const config = JSON.parse(localStorage.getItem('configBot') || '{}');
  if (config.pares) document.getElementById('bot-pares').value = config.pares;
  if (config.quantidade) document.getElementById('bot-quantidade').value = config.quantidade;
  if (config.queda) document.getElementById('bot-queda').value = config.queda;
  if (config.alta) document.getElementById('bot-alta').value = config.alta;
  if (config.intervalo) document.getElementById('bot-intervalo').value = config.intervalo;
}

// Inicializações
atualizarTabelas();
setInterval(atualizarTabelas, 5000);
atualizarPainelAcoes();
setInterval(atualizarPainelAcoes, 5000);
atualizarSaldo();
setInterval(atualizarSaldo, 5000);
atualizarFinanceiro();
setInterval(atualizarFinanceiro, 5000);

setInterval(() => {
  atualizarSaldo();
  atualizarOrdens();
  atualizarTrades();
  atualizarStatusBot();
  atualizarFinanceiro();
}, 5000);

atualizarSaldo();
atualizarOrdens();
atualizarTrades();
atualizarStatusBot();
atualizarFinanceiro();
salvarConfigBot();

async function iniciarBot() {
  salvarConfigBot();
  const acoesSelect = document.getElementById('acoes-select');
  const pares = Array.from(acoesSelect.selectedOptions).map(opt => opt.value);

  const quantidade = parseFloat(document.getElementById('bot-quantidade').value);
  const queda = parseFloat(document.getElementById('bot-queda').value);
  const alta = parseFloat(document.getElementById('bot-alta').value);
  const intervalo = parseInt(document.getElementById('bot-intervalo').value) * 1000;
  const stopLossPercent = parseFloat(document.getElementById('bot-stoploss').value);
  const limiteDiario = parseInt(document.getElementById('bot-limite-diario').value);
  const maxPorOperacaoPercent = parseInt(document.getElementById('bot-max-op').value);
  const lucroFixo = parseFloat(document.getElementById('bot-lucro-fixo').value) || null;
  const prejuizoFixo = parseFloat(document.getElementById('bot-prejuizo-fixo').value) || null;

  const config = {
    pares,
    quantidade,
    queda,
    alta,
    intervalo,
    stopLossPercent,
    limiteDiario,
    maxPorOperacaoPercent,
    lucroFixo,
    prejuizoFixo
  };

  const res = await fetch('http://localhost:3000/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  const data = await res.json();
  document.getElementById('mensagem').innerText = data.status || 'Bot iniciado!';
  atualizarStatusBot && atualizarStatusBot();
}

async function comprar() {
  salvarConfigBot();
  // ...restante da função comprar...
  // Exemplo:
  const acao = document.getElementById('acao-compra').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('quantidade-compra').value);
  const symbol = acao + 'USDT';
  if (!quantidade || quantidade <= 0) {
    alert('Quantidade inválida!');
    return;
  }
  try {
    const res = await fetch('http://localhost:3000/binance/comprar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, quantity: quantidade })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Compra enviada!\n' + JSON.stringify(data, null, 2));
    } else {
      alert('Erro ao comprar: ' + (data.error || JSON.stringify(data)));
    }
  } catch (e) {
    alert('Erro de conexão com o backend.');
  }
  atualizarTabelas && atualizarTabelas();
}

async function vender() {
  salvarConfigBot();
  // ...restante da função vender...
  // Exemplo:
  const acao = document.getElementById('acao-venda').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('quantidade-venda').value);
  const symbol = acao + 'USDT';
  if (!quantidade || quantidade <= 0) {
    alert('Quantidade inválida!');
    return;
  }
  try {
    const res = await fetch('http://localhost:3000/binance/vender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, quantity: quantidade })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Venda enviada!\n' + JSON.stringify(data, null, 2));
    } else {
      alert('Erro ao vender: ' + (data.error || JSON.stringify(data)));
    }
  } catch (e) {
    alert('Erro de conexão com o backend.');
  }
  atualizarTabelas && atualizarTabelas();
}

async function getPrecoMercado(symbol) {
  try {
    const res = await fetch(`https://testnet.binance.vision/api/v3/ticker/price?symbol=${symbol}`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

async function atualizarParesAtivos() {
  try {
    const res = await fetch('http://localhost:3000/status');
    const data = await res.json();
    const pares = (data.config && data.config.pares && data.config.pares.length)
      ? data.config.pares.join(', ')
      : 'Nenhum';
    document.getElementById('lista-pares-ativos').innerText = pares;
  } catch {
    document.getElementById('lista-pares-ativos').innerText = 'Erro ao carregar';
  }
}

setInterval(atualizarParesAtivos, 5000);
atualizarParesAtivos();