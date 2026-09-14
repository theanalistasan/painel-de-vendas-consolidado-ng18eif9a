# Painel de Vendas Consolidado — Controle de Versões

## Versão e Status Atual

- **Versão**: v1.2
- **Data do Backup**: 15/09/2026
- **Status**: QA aprovado, estável — Reestruturação do Dashboard em duas visões especializadas (Visão Geral em `/dashboard/geral` e Visão Canais em `/dashboard/canais`), correção definitiva do bug "Nenhuma venda encontrada" com matching case-insensitive de grupos de itens no backend e frontend, recuperação integral da listagem de Vendas Recentes, banner de aviso condicionado a dados estritamente vazios e padronização dos filtros padrão em ambas as visões.

---

## Destaques da Versão 1.2 (15/09/2026)

1. **Reestruturação do Dashboard em Duas Visões Especializadas**:
   - **Dashboard — Visão Geral (`/dashboard/geral` e rota `/`)**:
     - Painel macro executivo com 8 indicadores principais consolidados:
       1. _KPIs Comerciais_ (Faturamento Bruto, Valor Líquido, Itens Vendidos, Documentos NFe e Devoluções com comparações).
       2. _Evolução de Vendas por Ano_ (histórico anual completo com faturamento, devoluções e taxa de crescimento YoY).
       3. _Tendência de Vendas — Equipamentos_ (série temporal contínua de longo prazo 2015+ para equipamentos).
       4. _Acumulado de Vendas — Insumos_ (série temporal contínua para Peças, Tintas e Acessórios).
       5. _Evolução Mensal com Comparativo Ano Anterior_ (faturamento do período vs. mesmo mês do ano anterior e devoluções).
       6. _Venda Mensal por Grupo do Item_ (distribuição empilhada/comparativa mês a mês por categoria).
       7. _Distribuição por Grupo de Item_ (gráfico Donut com percentual de participação de cada família de produtos).
       8. _Clientes Ativos — Equipamentos e Clientes Ativos — Insumos_ (contagem precisa de CNPJs/clientes ativos mês a mês comparados ao ano anterior).
   - **Dashboard — Visão Canais (`/dashboard/canais`)**:
     - Dashboard geográfico e comercial especializado:
       1. _Vendas por Estado (UF) & Região_ com Mapa Interativo do Brasil em SVG e ranking por macrorregiões (Sudeste, Sul, Nordeste, Centro-Oeste e Norte).
       2. _Pinos Geográficos de Revendas Roland DG_ no mapa com faturamento, documentos e itens vinculados a cada revendedor autorizado.
       3. _Expansão em Tela Cheia_ do mapa do Brasil (modal responsivo `96vw x 92vh`).
       4. _Top 10 Vendedores_ e _Top 10 Clientes_ em cards de ranking ranqueados por faturamento.
       5. _Vendas Recentes_ com listagem tabular dos últimos lançamentos e atalho para o detalhamento em `/vendas`.
   - **Navegação Integrada e Intuitiva**:
     - Menu lateral (Sidebar) atualizado com links diretos para "Visão Geral" (`/dashboard/geral`) e "Visão Canais" (`/dashboard/canais`) com ícones dedicados e badges identificadores.
     - Botão de alternância rápida entre as duas visões no cabeçalho dos dashboards para transição fluida de contexto mantendo os filtros.

2. **Correção do Bug "Nenhuma venda encontrada" (Matching de Grupo do Item)**:
   - Resolução da divergência de capitalização entre os grupos do item gravados na base de dados (`EQUIPAMENTOS`, `ACESSORIOS`, `TINTAS`, `PECAS` vs. `Equipamentos`, `Acessórios`, `Tintas`, `Peças`).
   - Implementação de matching case-insensitive no backend (`pocketbase/hooks/dashboard_stats.js`) e no frontend (`src/services/sales.ts`, `src/lib/filter-persistence.ts`).
   - Eliminação de filtros vazios na inicialização e normalização de acentuação/caixa alta nos comparadores SQL (`UPPER(grupo_item) IN (...)` ou matching normalizado).

3. **Correção da Consulta de Vendas Recentes**:
   - Correção na consulta do endpoint de Vendas Recentes para compatibilidade com os filtros aplicados e paginação, garantindo que a lista sempre reflita os últimos documentos faturados sem truncamento ou retorno nulo.

4. **Banner de Aviso Restrito a Dados Realmente Vazios**:
   - O banner de aviso informativo só é disparado quando a base de dados filtrada estiver genuinamente vazia (zero faturamento e zero registros), eliminando falsos positivos de tela vazia durante carregamentos ou com filtros válidos ativos.

5. **Garantia de Filtro Padrão Consistente nas Duas Visões**:
   - Inicialização idêntica, dinâmica e validada tanto na Visão Geral quanto na Visão Canais:
     - **Ano**: Ano mais recente disponível na base (ex: 2026).
     - **Mês**: Último mês com movimentação registrada na base (ex: Ago-2026).
     - **Tipo de Documento**: `"NF de Saída"`.
     - **Grupos do Item**: Seleção prévia com `"Equipamentos"`, `"Acessórios"`, `"Tintas"` e `"Peças"`.
     - **Utilização**: Tipos de operação contendo `"VENDA"` (ex: `"VENDA DE MERCADORIA"`, `"VENDA CONSUMO"`).
     - **Base**: `"ambos"` (RacNew e NetSales consolidados).
   - Persistência e sincronização de filtros via `sessionStorage` (`filter-persistence.ts`), preservando seleções customizadas ao navegar entre Visão Geral, Visão Canais e a página analítica de Vendas.

---

## Destaques da Versão 1.0.7 (11/09/2026)

1. **Tabelas de Resumo Pré-Calculadas (Migração 0021)**:
   - Criação e inicialização automática das tabelas agregadas `resumo_vendas_mensal`, `resumo_clientes_ativos` e `resumo_vendas_uf_regiao` com índices B-Tree específicos por período, dimensão e base.
   - Eliminação de scans pesados repetidos sobre a tabela `vendas` (125k+ registros) em cada requisição do Dashboard.
   - Migração 0021 aplicada e sincronizada sem alterar ou perder as bases brutas (`produtos`, `racnew`, `netsales`, `vendas`).

2. **Reconciliação e Preenchimento Contínuo (`cron_reconcile_summaries.js` e `consolidar_vendas.js`)**:
   - Criação da rotina agendada `reconcile_sales_summaries` (`cronAdd('reconcile_sales_summaries', '0 */2 * * *')`) que sincroniza atomicamente as tabelas de resumo sem duplicar jobs.
   - Atualização do endpoint de consolidação `POST /backend/v1/vendas/consolidar` para atualizar instantaneamente os resumos sempre que novas cargas/importações forem realizadas.

3. **Dashboard de Alta Performance com Regras de Negócio Preservadas (`dashboard_stats.js`)**:
   - Tempo de resposta do endpoint `POST /backend/v1/dashboard/stats` reduzido de ~35s para < 2s sem `TIMEOUT_EXCEEDED`.
   - **Regras de negócio 100% preservadas**:
     - _Tendência de Vendas — Equipamentos_ e _Acumulado — Insumos_: trazem SEMPRE toda a base histórica (2015+), ignorando filtros de período e respeitando apenas a seleção de base (`ambos`/`racnew`/`netsales`).
     - _Evolução de Vendas por Ano_: traz SEMPRE todos os anos da base histórica com variação ano a ano.
     - _Clientes Ativos — Equipamentos e Insumos_: contagem precisa de clientes distintos por mês e comparativo com o mesmo mês do ano anterior.
     - _Filtros de período/tipo/grupo/utilização_: funcionam em milissegundos sobre os índices dos resumos pré-calculados.
     - _Mapa do Brasil & Pinos de Revendas_: geolocalização e cálculo do faturamento das revendas oficiais totalmente integrados.
     - _Filtros iniciais_: mantidos dinamicamente (ano mais recente, último mês com dados, NF de Saída, grupos Equipamentos/Acessórios/Tintas/Peças, utilizações contendo VENDA, base Ambos).

4. **Auditoria Estabilizada (`src/services/audit.ts`)**:
   - Desativação completa do caminho de gravação direta `POST /api/collections/audit_logs/records` (que retornava 400).
   - Roteamento exclusivo pelo endpoint dedicado `POST /backend/v1/audit/log`.
   - Gravação mantida estritamente _best-effort_ (não bloqueia navegação nem lança erros para o usuário).

---

## Destaques da Versão 1.0.6 (03/09/2026)

1. **Correção dos Gráficos "Clientes Ativos — Equipamentos" e "Clientes Ativos — Insumos" (`pocketbase/hooks/dashboard_stats.js`)**:
   - Os gráficos estavam vazios por causa de uma variável fora de escopo no hook `dashboard_stats.js` introduzida pelas otimizações de performance da versão anterior.
   - Correção aplicada: os dois gráficos voltam a buscar a **data mais recente dos dados computados** para calcular corretamente a janela dos últimos 6 meses e o comparativo com o ano anterior, sem voltar a fazer scans completos de `MAX(data_lancamento)` desnecessários.

2. **Gráfico "Evolução de Vendas por Ano" com a Base Histórica Completa (2019–2026)**:
   - O gráfico agora mostra **todos os anos da base** (2019 a 2026), independente dos filtros de período (Data De/Até, Ano, Mês, Dia) e demais dimensões contextuais aplicados no Dashboard.
   - Respeita exclusivamente a seleção de base de dados (**RacNew**, **NetSales** ou **Ambos**) — mesmo padrão já adotado pelos demais gráficos históricos contínuos ("Tendência de Vendas — Equipamentos" e "Acumulado — Insumos").

3. **Remoção do Botão "Importar Dados" do Banner de Aviso no Dashboard**:
   - O botão de atalho "Importar Dados" foi removido do banner de aviso do Dashboard para simplificar a interface.
   - O acesso à importação permanece disponível **apenas pelo menu lateral** (rota protegida `/importar`), mantendo o controle de acesso por senha master.

4. **Filtro Inicial de Mês Inteligente (mês atual ou último mês com dados)**:
   - No primeiro acesso ao Dashboard (sem filtros salvos em `sessionStorage`), o filtro de Mês agora carrega o **mês atual** ou, quando o mês corrente ainda não tem movimentação registrada, o **último mês com dados na base** (atualmente Agosto/2026).
   - Mantém o comportamento dinâmico existente dos demais filtros iniciais (Ano mais recente, Tipo de Documento, Grupos do Item, Utilização "VENDA" e base "Ambos").

5. **Otimizações de Performance e Timeouts Alinhados (das versões anteriores, preservadas nesta release)**:
   - Backend `dashboard_stats.js` / `vendas_list.js` com guard de execução de **35s** (HTTP 504 amigável) e queries otimizadas em índices B-tree para varreduras completas (125k+ registros).
   - Frontend com timeout de **40s** em `sales.ts` (evitando conexões quebradas no navegador antes de receber o payload ou erro amigável), deduplicação de requisições concorrentes e tratamento de status 504 com "Limpar Filtros" / "Tentar Novamente".

---

## Destaques da Versão 1.0.5

1. **Filtros Iniciais Restaurados no Dashboard (v0.0.84)**:
   - Configuração dinâmica e inteligente dos filtros padrão no primeiro acesso ao Dashboard via `buildDynamicInitialFilters`:
     - **Ano**: Ano mais recente disponível na base (ex: 2026).
     - **Mês**: Último mês com movimentação na base (ex: mês 8 / Agosto).
     - **Tipo de Documento**: Pré-seleção de `"NF de Saída"`.
     - **Grupo do Item**: Multi-seleção com `"Equipamentos"`, `"Acessórios"`, `"Tintas"` e `"Peças"`.
     - **Utilização**: Todos os tipos da base contendo `"VENDA"` (ex: `"VENDA DE MERCADORIA"`, `"VENDA CONSUMO"`).
     - **Base**: `"ambos"` (RacNew e NetSales consolidados).
   - Persistência automática em `sessionStorage` (`loadFiltersFromSession` / `saveFiltersToSession`), garantindo que o usuário mantenha suas customizações durante a navegação.

2. **Novo Indicador "Vendas por Estado (UF) & Região" com Mapa Interativo do Brasil (v0.0.84)**:
   - Componente interativo vetorial SVG puro (`VendasPorEstadoIndicador.tsx`) renderizando todos os 26 estados + Distrito Federal com escala cromática Roland DG (tons graduais de ciano e azul Roland `#0B6E99`).
   - Ranking consolidado por Região (Sudeste, Sul, Nordeste, Centro-Oeste e Norte) com valores absolutos, participação percentual e listagem expansível dos estados.
   - Interatividade bidirecional completa: passar o mouse ou clicar em qualquer estado sincroniza o filtro global de UF do Dashboard (`filters.estado`).

3. **Pinos das Revendas Oficiais Roland DG Brasil no Mapa (v0.0.85)**:
   - Mapeamento e plotagem vetorial geográfica de todas as revendas oficiais autorizadas da Roland DG no Brasil (`src/data/revendas.ts`).
   - Botão seletor no cabeçalho do mapa para exibir ou ocultar os pinos de revenda com contadores dinâmicos.
   - Card flutuante interativo ao clicar em um pino de revenda:
     - Dados cadastrais (Razão Social, Nome Fantasia, Cidade/UF, telefone de contato e link direto de navegação/Google Maps).
     - **Faturamento Vinculado**: Exibição em tempo real do faturamento acumulado, documentos faturados e total de itens vendidos pela revenda conforme os filtros ativos.

4. **Posicionamento de Destaque no Dashboard (v0.0.85)**:
   - O indicador "Vendas por Estado (UF) & Região" foi promovido para o topo do Dashboard, posicionado imediatamente acima dos 4 gráficos temáticos e dos 5 KPIs principais.
   - Proporciona visão macro geográfica instantânea da performance comercial logo na abertura do sistema.

5. **Expansão em Tela Cheia do Mapa do Brasil (v0.0.86)**:
   - Botão de expansão rápida (`Expand`) no cabeçalho do card do mapa do Brasil.
   - Modal em tela cheia otimizado (`DialogContent` com dimensões `96vw x 92vh`, bordas arredondadas e backdrop elegante).
   - Sincronização bidirecional em tempo real do estado de filtros, seleção de UF e detalhes de revendas entre o card padrão e o modal expandido.
   - Visualização ampla e confortável do mapa do Brasil em monitores de alta resolução e notebooks.

---

## Destaques da Versão 1.0.4

1. **Dashboards Históricos Globais de Longo Prazo (Hook `dashboard_stats.js`)**:
   - Ajuste estrutural nas queries de agregação dos gráficos **"Tendência de Vendas — Equipamentos"** (`vendasEquipamentosHistorico`) e **"Acumulado — Insumos"** (`vendasInsumosHistorico` — Peças, Tintas e Acessórios).
   - Ambos os gráficos agora utilizam a cláusula `sqlWhereHistorical`, trazendo sempre a **base histórica completa** e contínua do início ao fim, ignorando filtros de período (Data De/Até, Ano, Mês, Dia) e dimensões contextuais, respeitando estritamente apenas a seleção de base de dados (**RacNew**, **NetSales** ou **Ambos**).
   - Garante que a curva histórica de evolução não seja truncada quando o usuário aplica filtros pontuais para analisar um mês ou período específico no restante do dashboard.

2. **Backend & Endpoints Consolidados (PocketBase)**:
   - Endpoint `POST /backend/v1/dashboard/stats` totalmente funcional e otimizado com queries SQL agregadas via `$app.db().newQuery()` para alta performance em grandes volumes de dados.
   - Deploy de pb_hooks validado sem erros de sintaxe ou timeouts.
   - Retorno integral de KPIs, gráficos históricos/mensais, análise de equipamentos/insumos, clientes ativos e opções de filtros distintos.

3. **Identidade Visual Roland DG Brasil**:
   - Paleta corporativa refinada: preto/cinza grafite escuro (`#0F172A`, `#141E33`), branco e cinzas neutros (`#F8FAFC`, `#94A3B8`).
   - Cores de destaque nos gráficos e badges: Azul Roland (`#0B6E99` / `209 100% 32%`) e Ciano Roland (`189 100% 38%`).
   - Logo oficial Roland sem o laranja legado: ícone gráfico com bloco superior azul (`#0059C1`) e barra inferior cinza (`#2D3748` / `#94A3B8`), com tipografia "Roland" em vetor puro.

4. **Navegação & Layout Responsivo**:
   - Sidebar desktop colapsável com persistência em `localStorage` (`sidebar_collapsed`), botões rápidos de recolher/expandir no header (`PanelLeftClose` / `PanelLeftOpen`) e menu drawer para dispositivos móveis.
   - Header com data atual formatada por extenso em português e badge de status da sincronização de bases.
   - Footer informativo com data/hora da última carga de dados consolidada.

5. **Gerenciador Central de Sessão & Autenticação Robusta**:
   - Centralizador `safeAuthRefresh` em `src/lib/pocketbase/auth-session.ts` com mutex anti-concorrência (deduplicação de chamadas em voo) e timeout de segurança (6s).
   - `AuthContext` com timer/fallback de segurança no boot (máximo 5s de `isLoading`), impedindo telas brancas ou travamento por instabilidade momentânea do backend.
   - Tratamento específico de erros: preservação da sessão local em quedas transitórias de rede e limpeza seletiva do `authStore` apenas mediante resposta 401/403 explícita.

6. **Filtros Globais Multi-Seleção & Persistência**:
   - Filtros padrão inicializados zerados/abertos (sem restrições no primeiro acesso), garantindo visão completa imediata do faturamento.
   - Suporte a seleção de bases: Ambos, RacNew e NetSales.
   - Dimensões: Data De/Até, Ano, Mês, Dia, Vendedor > Cliente, Vendedor, Grupo do Item, Estado (UF), Tipo de Documento, Utilização, Tipo de Devolução e Busca Textual.
   - Pílulas ativas com remoção rápida individual e popover para filtros adicionais (`+N filtros`).
   - Persistência sincronizada em `sessionStorage`.

---

## Destaques da Versão 1.0.3

1. **Backend & Endpoints Consolidados (PocketBase)**:
   - Endpoint `POST /backend/v1/dashboard/stats` totalmente funcional e otimizado com queries SQL agregadas via `$app.db().newQuery()` para alta performance em grandes volumes de dados.
   - Deploy de pb_hooks validado sem erros de sintaxe ou timeouts.
   - Retorno integral de KPIs, gráficos históricos/mensais, análise de equipamentos/insumos, clientes ativos e opções de filtros distintos.

2. **Identidade Visual Roland DG Brasil**:
   - Paleta corporativa refinada: preto/cinza grafite escuro (`#0F172A`, `#141E33`), branco e cinzas neutros (`#F8FAFC`, `#94A3B8`).
   - Cores de destaque nos gráficos e badges: Azul Roland (`#0B6E99` / `209 100% 32%`) e Ciano Roland (`189 100% 38%`).
   - Logo oficial Roland sem o laranja legado: ícone gráfico com bloco superior azul (`#0059C1`) e barra inferior cinza (`#2D3748` / `#94A3B8`), com tipografia "Roland" em vetor puro.

3. **Navegação & Layout Responsivo**:
   - Sidebar desktop colapsável com persistência em `localStorage` (`sidebar_collapsed`), botões rápidos de recolher/expandir no header (`PanelLeftClose` / `PanelLeftOpen`) e menu drawer para dispositivos móveis.
   - Header com data atual formatada por extenso em português e badge de status da sincronização de bases.
   - Footer informativo com data/hora da última carga de dados consolidada.

4. **Gerenciador Central de Sessão & Autenticação Robusta**:
   - Centralizador `safeAuthRefresh` em `src/lib/pocketbase/auth-session.ts` com mutex anti-concorrência (deduplicação de chamadas em voo) e timeout de segurança (6s).
   - `AuthContext` com timer/fallback de segurança no boot (máximo 5s de `isLoading`), impedindo telas brancas ou travamento por instabilidade momentânea do backend.
   - Tratamento específico de erros: preservação da sessão local em quedas transitórias de rede e limpeza seletiva do `authStore` apenas mediante resposta 401/403 explícita.

5. **Filtros Globais Multi-Seleção & Persistência**:
   - Filtros padrão inicializados zerados/abertos (sem restrições no primeiro acesso), garantindo visão completa imediata do faturamento.
   - Suporte a seleção de bases: Ambos, RacNew e NetSales.
   - Dimensões: Data De/Até, Ano, Mês, Dia, Vendedor > Cliente, Vendedor, Grupo do Item, Estado (UF), Tipo de Documento, Utilização, Tipo de Devolução e Busca Textual.
   - Pílulas ativas com remoção rápida individual e popover para filtros adicionais (`+N filtros`).
   - Persistência sincronizada em `sessionStorage`.

---

## Credenciais e Acessos Padronizados

- **Senha Padrão (Todos os Usuários)**: `Roland@1234`
- **Senha Master Admin (Modal de Proteção)**: `Reset@Painel2025`

### Lista de Usuários (@rolanddg.com.br):

1. `silvio.mattos@rolanddg.com.br` — Silvio Mattos (Admin)
2. `nicolas.brito@rolanddg.com.br` — Nicolas Brito (Admin)
3. `fred.lunardini@rolanddg.com.br` — Fred Lunardini (User)
4. `anderson.clayton@rolanddg.com.br` — Anderson Clayton (User)
5. `edson.salles@rolanddg.com.br` — Edson Salles (User)
6. `caroline.diniz@rolanddg.com.br` — Caroline Diniz (User)
7. `carine.santos@rolanddg.com.br` — Carine Cristina Santos (User)

---

## Resumo das Funcionalidades Estáveis

1. **Dashboard com 5 KPIs e Gráficos Estratégicos**:
   - **5 KPIs**: Faturamento Bruto, Valor Líquido, Itens Vendidos, Documentos (NFe) e Devoluções.
   - **Gráficos Históricos e Estratégicos**:
     - _Evolução de Vendas por Ano_ (Faturamento, Devoluções e Variação % Ano a Ano).
     - _Tendência de Vendas — Equipamentos_ (Linha contínua mensal por período cronológico).
     - _Acumulado de Vendas — Insumos_ (Linha do tempo contínua para Peças, Tintas e Acessórios).
     - _Evolução de Vendas por Mês_ (Últimos 6 meses com comparativo de ano anterior e devoluções).
     - _Venda Mensal por Grupo do Item_ (Últimos 6 meses com barras comparativas por grupo).
     - _Vendas por Grupo do Item_ (Distribuição percentual em Donut).
     - _Top 10 Vendedores_ e _Top 10 Clientes_ (Rankings por faturamento).
     - _Vendas por Estado (UF)_ (Distribuição regional).
     - _Clientes Ativos — Equipamentos_ e _Clientes Ativos — Insumos_ (Últimos 6 meses vs. ano anterior).
   - **Vendas Recentes**: Listagem dos últimos lançamentos com link direto para a visão analítica.

2. **Página de Vendas Analítica**:
   - Tabela com ordenação server-side por todas as colunas.
   - Agrupamento inteligente por Nº NFe com somatório de itens e detalhamento colapsável.
   - Badges identificadores de origem (RacNew e NetSales).
   - Paginação sob demanda com seleção de registros por página.

3. **Exportação CSV Completa**:
   - Exportação de todos os registros correspondentes aos filtros ativos.
   - Padrão brasileiro (separador `;`, formatação numérica pt-BR e UTF-8 com BOM para compatibilidade com Microsoft Excel).

4. **Segurança, Auditoria & Gestão**:
   - Proteção de rotas restritas (`/importar`, `/admin`, `/usuarios`, `/auditoria`) com modal de segundo fator por senha master.
   - Gestão de Usuários completa com convites e atribuição de perfis (Admin / User).
   - Auditoria completa com logs de ações, logins, exportações e acessos.

---

## Histórico de Versões

- **v1.2 (15/09/2026)**: Backup estável oficial do projeto. Incorpora:
  - Reestruturação do Dashboard em duas visões especializadas: Dashboard — Visão Geral em `/dashboard/geral` (com os 8 indicadores macro migrados) e Dashboard — Visão Canais em `/dashboard/canais` (mapa do Brasil interativo, ranking regional, pinos geográficos de revendas, KPIs, rankings Top 10 e vendas recentes).
  - Correção definitiva do bug "Nenhuma venda encontrada": matching case-insensitive de `grupo_item` no backend e frontend, consulta de Vendas Recentes corrigida e banner de alerta condicionado a dados estritamente vazios.
  - Filtro padrão garantido e sincronizado em ambas as visões (Ano atual, Mês = último disponível na base ex.: Ago-2026, NF de Saída, grupos Equipamentos/Acessórios/Tintas/Peças, utilizações contendo VENDA e base Ambos).
- **v1.0.7 (11/09/2026)**: Backup estável — tabelas de resumo pré-calculadas (SQLite), reconciliação automática contínua via cron e hook de consolidação, dashboard ultra veloz (< 2s) lendo dos resumos com todas as regras de negócio preservadas e auditoria estabilizada sem POST direto na coleção.
- **v1.0.6 (03/09/2026)**: Backup de segurança oficial do projeto (estado atual = commit `0.0.95`). Incorpora:
  - Correção dos gráficos "Clientes Ativos — Equipamentos" e "Clientes Ativos — Insumos" (estavam vazios por variável fora de escopo no hook `pocketbase/hooks/dashboard_stats.js` após otimizações; agora buscam a data mais recente dos dados computados).
  - Gráfico "Evolução de Vendas por Ano" mostrando todos os anos da base (2019–2026), independente dos filtros de período, respeitando apenas a seleção de base (RacNew/NetSales/Ambos) — mesmo padrão dos gráficos históricos.
  - Remoção do botão "Importar Dados" do banner de aviso no Dashboard (acesso restrito ao menu lateral).
  - Filtro inicial de Mês carregando o mês atual ou o último mês com dados na base (hoje Agosto/2026).
  - Otimizações de performance e timeouts alinhados (backend 35s / frontend 40s) das versões anteriores preservadas.
- **v1.0.5 (01/09/2026)**: Backup de segurança oficial do projeto (estado atual = commit `0.0.86`). Incorpora:
  - **v0.0.84**: Filtros iniciais restaurados no Dashboard (Ano mais recente, último mês, NF de Saída, Grupos Equipamentos/Acessórios/Tintas/Peças, Utilização com "VENDA", base Ambos) + novo indicador interativo "Vendas por Estado (UF)" com mapa do Brasil e ranking regional.
  - **v0.0.85**: Pinos geográficos das revendas autorizadas Roland DG no mapa do Brasil com faturamento detalhado ao clicar + mapa posicionado como primeiro indicador no topo do Dashboard.
  - **v0.0.86**: Expansão em tela cheia do card do mapa do Brasil (botão Expand, modal responsivo de 96vw x 92vh, sincronização de estado com filtros).
- **v1.0.4 (01/09/2026)**: Backup estável oficial (commit `0.0.83` / `0.0.82`) — ajuste do hook `pocketbase/hooks/dashboard_stats.js` para que os gráficos "Tendência de Vendas — Equipamentos" e "Acumulado — Insumos" sempre apresentem a base histórica inteira (via `sqlWhereHistorical`), ignorando filtros de período e dimensão e respeitando apenas a seleção de base (RacNew/NetSales/Ambos).
- **v1.0.3 (01/09/2026)**: Backup estável oficial (commit `0.0.81`) — hook `dashboard_stats.js` totalmente validado e deployável no backend PocketBase com queries agregadas via SQL puro; identidade visual Roland DG (preto, cinza, branco com acentos em azul #0B6E99 e ciano); logo corporativo Roland sem laranja; sidebar colapsável com persistência em localStorage; filtros padrão abertos/zerados no primeiro boot; gerenciador central de sessão (`safeAuthRefresh`) com mutex e timeout de segurança no boot.
- **v1.0.2 (22/08/2026)**: Backup de segurança — correção crítica de autenticação (AuthContext limpa pb.authStore no catch do authRefresh, eliminando token inválido que causava dados zerados ao navegar/refresh), filtro Seleção de Bases funcional (RacNew/NetSales/Ambos) com correção da lógica tem_netsales, badges de origem (RacNew âmbar, NetSales indigo), resumo de origens acima da tabela, coluna Tipo de Documento e coluna Origem na tabela de Vendas e CSV, e senhas padronizadas Roland@1234 para todos os 7 usuários + admin.
- **v0.0.59 (22/08/2026)**: Backup estável pré-"Seleção de Bases" — 5 KPIs, 9 gráficos, filtros multi-seleção persistentes, colapso por NFe, ordenação server-side, auditoria, exportação CSV completa, senhas padronizadas e QA aprovado.
- **v1.0 (20/08/2026)**: Release oficial estável no commit 0.0.56 com 22 frentes de otimização consolidadas.
- **v0.0.39**: Backup documental com funcionalidades ativas e bases consolidadas.
- **v0.0.36**: Backup pós-recuperação do backend.
- **v0.0.29**: Backup com rotas e filtros consolidados.
