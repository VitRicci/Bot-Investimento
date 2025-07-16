# Bot-Investimento
Bot de investimentos que simula a compra e venda de ações, com uma interface web para interação.
- Necessario colocar sua api e apisecret no backend
- Para rodar acesse a pasta de backend e digite no terminal "node server.js"
- Bot totalmente criado com IA buscando explorar os limites dela, totalmente funcional.

* LISTA COMPLETA DE TECNOLOGIAS USADAS *

-- Backend --
Node.js — Plataforma de execução JavaScript no servidor.
Express — Framework para criação de APIs REST.
binance-api-node — Biblioteca para integração com a API da Binance.
WebSocket (ws) — Biblioteca para conexão em tempo real com streams da Binance.
SQLite (sqlite3) — Banco de dados leve para armazenamento local.
JavaScript — Linguagem principal do backend.

-- Frontend --
HTML — Estrutura das páginas.
CSS — Estilização das páginas.
JavaScript — Lógica de interação, requisições à API e atualização dinâmica da interface.

* LISTA DE FUNCIONALIDADES DO BOT *

1. Compra e Venda Automática
Compra e vende automaticamente múltiplos pares de ativos (ex: BTCUSDT, ETHUSDT) usando critérios configuráveis.
Opera simultaneamente em vários pares, cada um com seu controle independente.
2. Estratégias de Operação
Compra baseada em queda percentual configurável.
Venda baseada em alta percentual ou lucro fixo configurável.
Stop loss automático por percentual ou valor fixo de prejuízo.
Venda automática se o lucro estimado for maior que o prejuízo estimado.
3. Controle de Operações
Limite diário de operações por ativo.
Controle de quantidade máxima por operação (percentual do saldo).
Controle de saldo disponível antes de operar.
4. Histórico e Financeiro
Registro de todas as operações (compra e venda) em banco de dados SQLite.
Cálculo e exibição de lucro, prejuízo, saldo e valor investido.
Histórico detalhado de trades e ordens abertas.
5. Metas
Cadastro e atualização de metas de lucro e prejuízo por ativo.
Consulta de metas salvas.
6. Gerenciamento
Iniciar e parar o bot via API.
Resetar histórico de lucro/prejuízo.
Resetar estado do bot e conexões WebSocket ao reiniciar.
7. WebSocket Streams
Utiliza WebSocket Streams da Binance para receber preços em tempo real, evitando bans.
8. API REST
Endpoints para compra, venda, consulta de saldo, ordens abertas, trades, metas, financeiro e status do bot.
9. Frontend (Interface Gráfica)
Seleção múltipla de pares para operar.
Exibição dos pares em operação em tempo real.
Painel de saldo por ativo.
Painel de ordens abertas e histórico de trades.
Exibição de lucro/prejuízo em tempo real.
Botões para iniciar/parar o bot, vender todos os ativos e resetar lucro/prejuízo.
10. Outros
Log detalhado das operações no console.
Tratamento de exceções para evitar travamentos.
Suporte à Binance Testnet para testes seguros.

* DICAS BASICAS DE UTILIZAÇÃO *

Sempre use a Testnet da Binance para testes

Nunca utilize suas chaves reais em ambiente de testes.
Confirme que está usando o endpoint https://testnet.binance.vision.
Selecione múltiplos pares apenas se tiver saldo suficiente

O bot pode operar vários pares ao mesmo tempo, mas cada operação exige saldo USDT disponível.
Configure limites de operação

Defina limites diários e máximos por operação para evitar grandes perdas por erro de configuração.
Aguarde o WebSocket conectar

O bot depende de WebSocket Streams para preços em tempo real. Aguarde a mensagem de “Bot automatizado iniciado!” antes de esperar operações.
Não feche o terminal/servidor durante operações

O backend precisa estar rodando para o bot operar e registrar trades.
Monitore logs e painel de status

Fique atento ao painel de status e logs para identificar rapidamente qualquer erro ou comportamento inesperado.
Evite iniciar múltiplas instâncias do bot

Iniciar o bot mais de uma vez pode causar conflitos e operações duplicadas.
Respeite os limites da API da Binance

O uso de WebSocket já minimiza riscos de banimento, mas evite alterar o código para usar polling/rest excessivo.
Sempre pare o bot antes de alterar configurações

Pare o bot, ajuste as configurações e só então inicie novamente para garantir que tudo seja aplicado corretamente.
Faça backup do banco de dados (trades.db) regularmente

Assim você não perde o histórico de operações em caso de problemas.
