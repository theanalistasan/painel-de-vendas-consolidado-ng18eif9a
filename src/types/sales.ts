import type { RecordModel } from 'pocketbase'

export interface Produto extends RecordModel {
  codigo_item: string
  descricao_item: string
  grupo_item: string
  ativo: string
  origem: string
  data_carga: string
}

export interface RacNew extends RecordModel {
  tipo_documento: string
  nf_entrega_futura: string
  numero_sap: string
  numero_nfe: string
  data_lancamento: string
  ultima_data_vencimento: string
  docto_origem_destino: string
  data_origem_destino: string
  condicao_pagamento: string
  codigo_cliente: string
  nome_cliente: string
  numero_linha: number
  codigo_item: string
  descricao_item: string
  quantidade: number
  qty_kg_lt: number
  preco_item: number
  desconto_linha: number
  icms: number
  pis: number
  cofins: number
  ipi: number
  icms_partilha: number
  total_linha: number
  utilizacao: string
  nome_vendedor: string
  custo_item: number
  nome_filial: string
  conta: string
  estado: string
  cidade: string
  origem: string
  data_carga: string
}

export interface NetSales extends RecordModel {
  tipo: string
  codigo_cliente: string
  nome_cliente: string
  grupo_cliente: string
  mercado: string
  usuario_emissor: string
  docdate: string
  chave_documento: string
  descrip: string
  itms_grp_nam: string
  codigo_item: string
  numero_documento: string
  quantidade: number
  preco_unitario: number
  valor_mercadoria: number
  total_nf_sem_frete: number
  total_nf_novo: number
  valor_liquido: number
  serial: string
  custo_total: number
  usage: string
  classificacao: string
  revenda: string
  vendedor_revenda: string
  municipio: string
  estado: string
  origem: string
  data_carga: string
}

export interface VendaConsolidada extends RecordModel {
  tipo_documento: string
  nf_entrega_futura: string
  numero_sap: string
  numero_nfe: string
  data_lancamento: string
  ultima_data_vencimento: string
  docto_origem_destino: string
  data_origem_destino: string
  condicao_pagamento: string
  codigo_cliente: string
  nome_cliente: string
  numero_linha: number
  codigo_item: string
  descricao_item: string
  quantidade: number
  qty_kg_lt: number
  preco_item: number
  desconto_linha: number
  icms: number
  pis: number
  cofins: number
  ipi: number
  icms_partilha: number
  total_linha: number
  utilizacao: string
  nome_vendedor: string
  custo_item: number
  nome_filial: string
  conta: string
  estado: string
  cidade: string
  // NetSales exclusive
  grupo_cliente: string
  mercado: string
  usuario_emissor_pedido: string
  itms_grp_nam: string
  numero_documento_netsales: string
  preco_unitario: number
  total_nf_sem_frete: number
  total_nf_novo: number
  valor_liquido: number
  custo_total: number
  classificacao: string
  vendedor_revenda: string
  // Enriched
  grupo_item: string
  vendedor_cliente: string
  origem: string
  tem_racnew?: boolean
  tem_netsales?: boolean
  data_carga: string
}

export interface FilterState {
  /** Seleção de Bases: 'ambos' (default) | 'racnew' | 'netsales' */
  base?: 'ambos' | 'racnew' | 'netsales'
  dataDe: string
  dataAte: string
  vendedorCliente: string[]
  vendedor: string[]
  grupoItem: string[]
  estado: string[]
  utilizacao: string[]
  search: string
  /** Anos (string[]) extraídos da Data de Lançamento, ex: ["2024", "2025"] */
  ano: string[]
  /** Meses (1-12 como string[]) */
  mes: string[]
  /** Dias (1-31 como string[]) */
  dia: string[]
  /** Tipo de Devolução: '' = Todas, ou um de 'Dev. Entrega' | 'Dev. NF' | 'DEVNF' */
  tipoDevolucao: string
  /** Tipos de documento (multi-valor) vindos de `tipo_documento` (ex: "NF de Saída", "Dev. NF", ...) */
  tipoDocumento: string[]
}

/** Venda mensal por grupo do item (últimos 3 meses) */
export interface VendaGrupoMensal {
  /** Mês no formato ISO "yyyy-mm", ex: "2025-06" */
  mes: string
  /** Faturamento (SUM(total_linha)) por grupo do item no mês */
  grupos: Array<{ grupo: string; total: number }>
}

export interface VendaHistoricoPeriodo {
  periodo: string
  total: number
}

export interface VendaPorAnoMes {
  ano: string
  valores: Array<{ mes: number; total: number }>
}

export interface ClientesAtivosEquipamentos {
  mes: string
  clientes: number
  clientesAnoAnterior: number
}

export interface ClientesAtivosInsumos {
  mes: string
  clientes: number
  clientesAnoAnterior: number
}

/** Tipos de documento considerados devolução */
export const DEVOLUCAO_TIPOS = ['Dev. Entrega', 'Dev. NF', 'DEVNF'] as const

/** Verifica se um tipo_documento é uma devolução */
export function isDevolucao(tipoDocumento: string | undefined | null): boolean {
  if (!tipoDocumento) return false
  return (DEVOLUCAO_TIPOS as readonly string[]).includes(tipoDocumento)
}

export interface ImportResult {
  success: boolean
  importados: number
  atualizados: number
  ignorados: number
  erros: string[]
  data_carga: string
  message?: string
}

export interface ConsolidarResult {
  success: boolean
  total_consolidado: number
  data_carga: string
}
