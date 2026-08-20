# Painel de Vendas Consolidado — Release Oficial

## Versão e Status

- **Versão**: 1.0
- **Data**: 14/04/2025
- **Status**: Estável / Release Oficial

---

## Credenciais de Acesso Administrativo

- **Administrador 1**: `silvio.mattos@rolanddg.com.br` | Senha: `Skip@Pass`
- **Administrador 2**: `nicolas.brito@rolanddg.com.br` | Senha: `Skip@Pass`
- **Senha de Acesso Admin (Modal de Proteção)**: `Reset@Painel2025`

---

## Resumo das Funcionalidades Implementadas

1. **Dashboard com KPIs Consolidados**:
   - Faturamento Bruto
   - Valor Líquido
   - Devoluções
   - Ticket Médio
   - Quantidade de Vendas (Documentos/Pedidos)

2. **9 Gráficos Analíticos e Históricos**:
   - **Evolução de Vendas por Ano**: Visão histórica anual com faturamento e devoluções.
   - **Tendência de Vendas — Equipamentos**: Linha contínua histórica de desempenho de máquinas/equipamentos.
   - **Acumulado de Vendas — Insumos**: Linha contínua histórica de consumo acumulado de insumos.
   - **Evolução de Vendas por Mês**: Visão mensal detalhada com devoluções e comparativo em relação ao mesmo período do ano anterior.
   - **Venda Mensal por Grupo do Item**: Comparativo dos últimos 6 meses com barras lado a lado por grupo.
   - **Vendas por Grupo do Item**: Distribuição consolidada de participação por categoria de produto.
   - **Clientes Ativos — Equipamentos**: Monitoramento e evolução da base de clientes ativos compradores de equipamentos.
   - **Clientes Ativos — Insumos**: Monitoramento e evolução da base de clientes ativos compradores de insumos.

3. **Página de Vendas Avançada**:
   - Tabela analítica completa com paginação sob demanda.
   - Ordenação server-side por qualquer coluna com feedback visual nos cabeçalhos.
   - Agrupamento colapsável por Nº NFe com somatório de itens e valores.

4. **Exportação CSV Completa**:
   - Exportação de todos os registros filtrados (sem limite de paginação).
   - Formato CSV padrão brasileiro (separador `;`, formatação numérica pt-BR e codificação compatível com Microsoft Excel).

5. **Filtros Globais Multi-Seleção com Persistência**:
   - Dimensões de filtro: Vendedor > Cliente (árvore hierárquica), Ano, Mês, Dia, Grupo de Item, Tipo de Documento, Utilização.
   - Persistência sincronizada via `sessionStorage` entre o Dashboard e a página de Vendas.

6. **Filtros Padrão Inteligentes na Inicialização**:
   - Utilização: `"Venda de Mercadoria"`
   - Ano: Ano atual vigente
   - Grupos de Item: `PEÇAS`, `TINTAS`, `ACESSÓRIOS`, `EQUIPAMENTOS`
   - Tipo de Documento: `"NF de Saída"`

7. **Módulo de Importação de Dados**:
   - Suporte a múltiplas bases: Produtos, RacNew e NetSales.
   - Preview interativo de dados antes do processamento.
   - Barra de progresso em tempo real e validação de schema.

8. **Consolidação SQL Avançada de Bases**:
   - Base mestra definida como **RacNew** com enriquecimento complementar da **NetSales** (12 campos exclusivos mapeados via `COALESCE`).
   - Flexibilização de constraints e integridade relacional sem perda de dados.

9. **Proteção de Rotas Administrativas com Senha**:
   - Modal de segurança para acesso a rotas restritas: `/importar`, `/admin`, `/usuarios` e `/auditoria`.
   - Autenticação de segundo fator com senha administrativa mestre.

10. **Gestão Completa de Usuários**:
    - CRUD completo (criação, edição, desativação/ativação e exclusão).
    - Convite de novos usuários por link direto.
    - Perfis de acesso diferenciados: Administrador e Usuário comum.

11. **Auditoria e Rastreabilidade Completa**:
    - Logs detalhados de login, logout, tentativas de autenticação e acessos administrativos.
    - Badges visuais por severidade/tipo de evento e filtros de pesquisa nos registros de log.

12. **Autenticação e Sessão de Usuários**:
    - Fluxo seguro de login e logout com tokens persistentes e proteção contra expiração.

13. **Layout Responsivo e Otimizado**:
    - Sidebar colapsável, cabeçalho dinâmico com perfil do usuário e drawer mobile para navegação em tablets e smartphones.

14. **Localização e Formatação Brasileira (pt-BR)**:
    - Padrão de datas `DD/MM/AAAA` em todas as tabelas, formulários, filtros e gráficos.
    - Moeda formatada em `R$` com separadores de milhar e decimais da norma brasileira.

15. **Correção de Datas na Importação**:
    - Tratamento robusto para serial dates do Microsoft Excel e strings de data em múltiplos formatos no parser frontend/backend.

16. **Colapso Inteligente de Pílulas de Filtro**:
    - Exibição limpa das primeiras pílulas com contador colapsável `+N filtros` para otimizar espaço de tela.

17. **Botão de Ação "Aplicar Filtros"**:
    - Controle manual de disparo de consultas para evitar recálculos desnecessários e requisições repetidas a cada seleção.

18. **Deduplicação de Nomes no Filtro Vendedor > Cliente**:
    - Normalização automática de espaços extras, caracteres invisíveis e casing para evitar duplicidade de vendedores e clientes na listagem.

---

## Histórico de Versões

- **v1.0 (14/04/2025)**: **Release Oficial Estável** com todas as 18 frentes funcionais consolidadas (Dashboard completo, 9 gráficos, tabela de vendas avançada, filtros multi-seleção persistentes, importação/consolidação SQL, auditoria, CRUD de usuários, segurança admin, responsividade e padrão pt-BR).
- **v0.0.39**: Backup documental com funcionalidades ativas, ~126k registros consolidados, RacNew + NetSales, 5 KPIs e 6 gráficos.
- **v0.0.36**: Backup pós-recuperação do backend (migrações, hooks, auth e superusuário restaurados).
- **v0.0.29**: Backup com rotas e filtros consolidados.
- **v0.0.27**: Backup de referência da arquitetura inicial.
