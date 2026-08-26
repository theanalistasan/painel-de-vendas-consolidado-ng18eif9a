# Painel de Vendas Consolidado — Controle de Versões

## Versão e Status Atual

- **Versão**: v1.0.2
- **Data do Backup**: 22/08/2026
- **Status**: QA aprovado, estável, correção de auth validada

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

## Resumo das Funcionalidades Estáveis (v0.0.59)

1. **Dashboard com 5 KPIs e 9 Gráficos**:
   - **5 KPIs**: Faturamento Bruto, Valor Líquido, Itens Vendidos, Documentos (NFe) e Devoluções.
   - **Gráficos Estratégicos e Históricos**:
     - _Evolução de Vendas por Ano_ (Faturamento e Devoluções com Variação % Ano a Ano).
     - _Tendência de Vendas — Equipamentos_ (Linha do tempo contínua por período cronológico).
     - _Acumulado de Vendas — Insumos_ (Linha do tempo contínua para Peças, Tintas e Acessórios).
   - **Gráficos com Filtros Ativos**:
     - _Evolução de Vendas por Mês_ (Últimos 6 meses com comparativo do ano anterior e devoluções).
     - _Venda Mensal por Grupo do Item_ (Últimos 6 meses com barras comparativas por grupo).
     - _Vendas por Grupo do Item_ (Distribuição de faturamento em Donut).
     - _Top 10 Vendedores_ (Ranking por faturamento).
     - _Top 10 Clientes_ (Ranking por faturamento).
     - _Vendas por Estado (UF)_ (Distribuição regional).
     - _Valor Líquido x Faturamento por Mês_ (Comparativo de margem financeira).
     - _Clientes Ativos — Equipamentos_ (Evolução nos últimos 6 meses vs. ano anterior).
     - _Clientes Ativos — Insumos_ (Evolução nos últimos 6 meses vs. ano anterior).

2. **Filtros Multi-Seleção Globais com Defaults e Persistência**:
   - Dimensões: Vendedor > Cliente, Vendedor, Grupo de Item, Estado, Tipo de Documento, Utilização, Tipo de Devolução, Ano, Mês, Dia e Busca Textual.
   - Defaults de inicialização: Utilização ("VENDA DE MERCADORIA"), Ano (vigente), Grupos (PEÇAS, TINTAS, ACESSÓRIOS, EQUIPAMENTOS), Tipo Doc ("NF de Saída").
   - Persistência total em `sessionStorage` sincronizada entre Dashboard e Vendas.
   - Botão "Aplicar Filtros" e "Limpar Filtros".

3. **Página de Vendas Analítica**:
   - Tabela com ordenação server-side por todas as colunas.
   - Agrupamento e colapso inteligente por Nº NFe com somatório de itens.
   - Paginação sob demanda server-side.

4. **Exportação CSV Completa**:
   - Exportação integral de todos os registros correspondentes aos filtros ativos (sem limitação de página).
   - Formatação no padrão brasileiro (separador `;`, formatação numérica pt-BR e compatibilidade Microsoft Excel com UTF-8 BOM).

5. **Segurança e Gestão**:
   - Proteção de rotas restritas (`/importar`, `/admin`, `/usuarios`, `/auditoria`) com modal de segundo fator por senha master.
   - CRUD de Usuários completo com convites e perfis.
   - Auditoria completa com logs de ações e acessos.
   - Backup oficial v1.0 documentado no commit 0.0.56.

---

## Histórico de Versões

- **v1.0.2 (22/08/2026)**: Backup de segurança — correção crítica de autenticação (AuthContext limpa pb.authStore no catch do authRefresh, eliminando token inválido que causava dados zerados ao navegar/refresh), filtro Seleção de Bases funcional (RacNew/NetSales/Ambos) com correção da lógica tem_netsales, badges de origem (RacNew âmbar, NetSales indigo), resumo de origens acima da tabela, coluna Tipo de Documento e coluna Origem na tabela de Vendas e CSV, e senhas padronizadas Roland@1234 para todos os 7 usuários + admin.
- **v0.0.59 (22/08/2026)**: Backup estável pré-"Seleção de Bases" — 5 KPIs, 9 gráficos, filtros multi-seleção persistentes, colapso por NFe, ordenação server-side, auditoria, exportação CSV completa, senhas padronizadas e QA aprovado.
- **v1.0 (20/08/2026)**: Release oficial estável no commit 0.0.56 com 22 frentes de otimização consolidadas.
- **v0.0.39**: Backup documental com funcionalidades ativas e bases consolidadas.
- **v0.0.36**: Backup pós-recuperação do backend.
- **v0.0.29**: Backup com rotas e filtros consolidados.
