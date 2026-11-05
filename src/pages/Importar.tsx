import React, { useState, useEffect, useRef } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Play,
  RotateCw,
  Database,
  Layers,
  ArrowRight,
  Info,
  X,
  FileText,
  History,
} from 'lucide-react'
import {
  importProdutosApi,
  importRacNewApi,
  importNetSalesApi,
  importCanaisClientesApi,
  consolidarVendasApi,
  reconstruirResumosApi,
  getConsolidacaoStatusApi,
  getCountsSummary,
} from '@/services/sales'
import { importPedidosAbertosApi, fetchUltimaCargaPedidosAbertos } from '@/services/pedidosAbertos'
import { importEstoqueSapApi, fetchUltimaCargaEstoqueSap } from '@/services/estoqueFaltante'
import { importTiposClienteApi, fetchUltimaCargaTiposCliente } from '@/services/tiposCliente'
import { logAudit } from '@/services/audit'
import { parseCSV, parseXLSX, formatNumber, formatDateTime } from '@/lib/formatters'
import type { ImportResult, ConsolidarResult } from '@/types/sales'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getMigracaoHistoricoStatus, migrarHistoricoApi } from '@/services/migracaoHistorico'
import type { MigracaoHistoricoStatus } from '@/services/migracaoHistorico'
import { getZerarBaseStatus, zerarBaseApi } from '@/services/zerarBase'
import type { ZerarBaseStatus, ZerarBaseStatusResponse } from '@/services/zerarBase'

const CHUNK_SIZE = 5000

interface BatchProgress {
  current: number
  total: number
  sent: number
}

interface BatchResult {
  importados: number
  atualizados: number
  mesclados?: number
  ignorados: number
  roteados_historico?: number
  historico_importados?: number
  historico_atualizados?: number
  janela?: import('@/types/sales').JanelaDinamicaInfo
  erros: string[]
  avisos: string[]
  failedBatches: number[]
  totalBatches: number
}

type BaseKey =
  | 'produtos'
  | 'racnew'
  | 'netsales'
  | 'canais_clientes'
  | 'pedidos_abertos'
  | 'estoque_sap'
  | 'tipos_cliente'

interface CardImportProps {
  title: string
  subtitle: string
  expectedColumns: string[]
  onImport: (
    rows: Record<string, unknown>[],
    batchMeta?: { batchIndex: number; totalBatches: number; isSubsequentBatch: boolean },
    modo?: 'atual' | 'historico',
  ) => Promise<ImportResult>
  badgeLabel: string
  badgeColor: string
  onConsolidationTrigger?: () => Promise<void>
  /** Total de registros atualmente na base (consultado do backend) */
  baseCount?: number
  /** Data da última importação/carga desta base (ISO) */
  lastImportDate?: string | null
  /** Bloco adicional informativo personalizado (ex.: dica de caminho no ERP/SAP) */
  customGuide?: React.ReactNode
  /** Callback disparado ao final da importação com o resultado consolidado */
  onImported?: (result: ImportResult) => void
  /**
   * Configuração para exibição de diálogo de confirmação antes de disparar a carga.
   * Usado para garantir aviso prévio de substituição total da base (ex.: Pedidos em Aberto).
   */
  confirmDialog?: {
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
  }
  /** Seletor de dois modos de importação (dados atuais vs históricos fora da janela) */
  hasModos?: boolean
}

function BaseImportCard({
  title,
  subtitle,
  expectedColumns,
  onImport,
  badgeLabel,
  badgeColor,
  onConsolidationTrigger,
  baseCount,
  lastImportDate,
  customGuide,
  onImported,
  confirmDialog,
  hasModos,
}: CardImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedModo, setSelectedModo] = useState<'atual' | 'historico'>('atual')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const isAcceptedFormat = (name: string) => {
    const lower = name.toLowerCase()
    return lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls')
  }

  const handleFile = (f: File) => {
    if (!isAcceptedFormat(f.name)) {
      toast({
        variant: 'destructive',
        title: 'Formato inválido',
        description: 'Por favor envie apenas arquivos .csv ou .xlsx (Excel).',
      })
      return
    }

    setFile(f)
    setResult(null)

    const isExcel = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer
          const rows = await parseXLSX(data)
          if (rows.length === 0) {
            toast({
              variant: 'destructive',
              title: 'Arquivo vazio',
              description: 'Nenhuma linha de dados encontrada na planilha.',
            })
            clearSelection()
            return
          }
          setParsedRows(rows)
        } catch (err) {
          console.error('Erro ao ler XLSX:', err)
          toast({
            variant: 'destructive',
            title: 'Erro ao ler XLSX',
            description: 'Não foi possível processar a planilha do Excel.',
          })
          clearSelection()
        }
      }
      reader.readAsArrayBuffer(f)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        try {
          const rows = parseCSV(text)
          if (rows.length === 0) {
            toast({
              variant: 'destructive',
              title: 'Arquivo vazio',
              description: 'Nenhuma linha de dados encontrada no CSV.',
            })
            clearSelection()
            return
          }
          setParsedRows(rows)
        } catch (err) {
          toast({
            variant: 'destructive',
            title: 'Erro ao ler CSV',
            description: 'Não foi possível processar as linhas do arquivo.',
          })
          clearSelection()
        }
      }
      reader.readAsText(f, 'UTF-8')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) return
    setLoading(true)
    setResult(null)
    setBatchResult(null)

    // Divide os registros em lotes de até CHUNK_SIZE
    const chunks: Record<string, string>[][] = []
    for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
      chunks.push(parsedRows.slice(i, i + CHUNK_SIZE))
    }
    const totalBatches = chunks.length

    setBatchProgress({ current: 0, total: totalBatches, sent: 0 })

    const acc: BatchResult = {
      importados: 0,
      atualizados: 0,
      mesclados: 0,
      ignorados: 0,
      erros: [],
      avisos: [],
      failedBatches: [],
      totalBatches,
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        const batchNum = i + 1
        setBatchProgress({ current: batchNum, total: totalBatches, sent: i * CHUNK_SIZE })

        try {
          const res = await onImport(
            chunks[i],
            {
              batchIndex: i,
              totalBatches,
              isSubsequentBatch: i > 0,
            },
            selectedModo,
          )
          acc.importados += res.importados || 0
          acc.atualizados += res.atualizados || 0
          acc.mesclados = (acc.mesclados || 0) + (res.mesclados || 0)
          acc.ignorados += res.ignorados || 0
          if (res.roteados_historico) {
            acc.roteados_historico = (acc.roteados_historico || 0) + res.roteados_historico
          }
          if (res.historico_importados) {
            acc.historico_importados = (acc.historico_importados || 0) + res.historico_importados
          }
          if (res.historico_atualizados) {
            acc.historico_atualizados = (acc.historico_atualizados || 0) + res.historico_atualizados
          }
          if (res.janela) {
            acc.janela = res.janela
          }
          if (res.erros && res.erros.length > 0) {
            acc.erros.push(...res.erros.slice(0, 20))
          }
          if (res.avisos && res.avisos.length > 0) {
            acc.avisos.push(...res.avisos)
          }
        } catch (err: unknown) {
          acc.failedBatches.push(batchNum)
          const errMsg = err instanceof Error ? err.message : 'Falha no lote'
          acc.erros.push(`Lote ${batchNum}/${totalBatches}: ${errMsg}`)
          // continua com os próximos lotes
        }
      }

      setBatchProgress({ current: totalBatches, total: totalBatches, sent: parsedRows.length })
      setBatchResult(acc)

      // Resumo consolidado (compatível com o box de resultado existente)
      const finalResult: ImportResult = {
        success: acc.failedBatches.length === 0,
        importados: acc.importados,
        atualizados: acc.atualizados,
        mesclados: acc.mesclados || 0,
        ignorados: acc.ignorados,
        erros: acc.erros,
        roteados_historico: acc.roteados_historico,
        historico_importados: acc.historico_importados,
        historico_atualizados: acc.historico_atualizados,
        janela: acc.janela,
        avisos: Array.from(new Set(acc.avisos)),
        data_carga: new Date().toISOString(),
      }
      setResult(finalResult)

      // Notifica o parent para armazenar o resultado desta base específica
      // e atualizar o total de registros na base consultando o backend.
      if (onImported) onImported(finalResult)

      if (acc.failedBatches.length === 0) {
        toast({
          title: `Importação de ${title} concluída`,
          description: `${acc.importados} novos, ${acc.atualizados} atualizados, ${acc.ignorados} ignorados em ${totalBatches} lote(s).`,
        })
      } else {
        toast({
          variant: 'destructive',
          title: `Importação de ${title} parcial`,
          description: `${totalBatches - acc.failedBatches.length} de ${totalBatches} lotes OK. Falharam: ${acc.failedBatches.join(', ')}.`,
        })
      }

      // Trigger automatic consolidation if provided, without crashing import feedback on failure
      if (onConsolidationTrigger) {
        try {
          await onConsolidationTrigger()
        } catch (consErr) {
          console.warn('Consolidação automática pós-importação falhou:', consErr)
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Falha na importação'
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description: errorMsg,
      })
    } finally {
      setLoading(false)
      setBatchProgress(null)
    }
  }

  const clearSelection = () => {
    setFile(null)
    setParsedRows([])
    setResult(null)
    setBatchProgress(null)
    setBatchResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Pré-visualização limitada às primeiras 100 linhas (performance)
  const previewRows = parsedRows.slice(0, 100).slice(0, 5)
  const previewHeaders = previewRows.length > 0 ? Object.keys(previewRows[0]).slice(0, 7) : []

  return (
    <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-bold text-slate-900 leading-tight">
                  {title}
                </CardTitle>
                {lastImportDate !== undefined && (
                  <span className="inline-flex items-center text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    Última importação:{' '}
                    <strong className="ml-1 text-slate-700">
                      {lastImportDate ? formatDateTime(lastImportDate) : 'nunca'}
                    </strong>
                  </span>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                {subtitle}
              </CardDescription>
            </div>
          </div>
          <Badge className={cn('text-[11px] font-semibold text-white shrink-0', badgeColor)}>
            {badgeLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4 flex-1">
        {/* Total na base (consultado do backend) */}
        {baseCount !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/60">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                Total de registros na base
              </span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {formatNumber(baseCount)}
              </span>
            </div>
            {/* Linhas no arquivo carregado (ainda não importado) —
                permite comparar arquivo X vs base Y antes de importar */}
            {file && parsedRows.length > 0 && !result && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Linhas no arquivo
                </span>
                <span className="text-sm font-bold text-indigo-900 tabular-nums">
                  {formatNumber(parsedRows.length)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Expected columns info */}
        <div className="text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 text-slate-600 space-y-1">
          <span className="font-semibold text-slate-800 block">Colunas esperadas:</span>
          <p className="line-clamp-2 leading-relaxed text-slate-500 font-mono text-[10px]">
            {expectedColumns.join(' • ')}
          </p>
        </div>

        {/* Bloco de Guia/Caminho do Relatório (se fornecido) */}
        {customGuide}

        {/* Dropzone */}
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors duration-150',
              dragOver
                ? 'border-indigo-500 bg-indigo-50/50'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50',
            )}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0])
              }}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center mb-2">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-800">
              Arraste seu arquivo CSV ou XLSX ou clique para selecionar
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Formatos aceitos: .csv ( ; ou , ) e .xlsx (Excel)
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* File info bar */}
            <div className="flex items-center justify-between p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs">
              <div className="flex items-center gap-2 truncate pr-2">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="font-semibold text-indigo-950 truncate">{file.name}</span>
                <span className="text-[11px] text-indigo-600">({parsedRows.length} linhas)</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700 hover:bg-indigo-100 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Preview table (first 5 rows) */}
            {previewRows.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 flex justify-between">
                  <span>
                    Pré-visualização (5 primeiras linhas
                    {parsedRows.length > 100 ? ' de 100 exibidas' : ''})
                  </span>
                  <span>Total lido: {parsedRows.length}</span>
                </div>
                <div className="max-h-36 overflow-x-auto overflow-y-auto">
                  <table className="w-full text-left text-[10px] whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                        {previewHeaders.map((h) => (
                          <th key={h} className="py-1 px-2 border-b border-slate-200">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {previewHeaders.map((h) => (
                            <td key={h} className="py-1 px-2 text-slate-700">
                              {row[h] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Batch progress bar */}
            {loading && batchProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                  <span>
                    Enviando lote {batchProgress.current} de {batchProgress.total}...
                  </span>
                  <span className="tabular-nums text-indigo-700">
                    {batchProgress.total > 0
                      ? Math.round((batchProgress.current / batchProgress.total) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    batchProgress.total > 0
                      ? (batchProgress.current / batchProgress.total) * 100
                      : 0
                  }
                  className="h-2"
                />
                <p className="text-[10px] text-slate-400">
                  Lotes de {formatNumber(CHUNK_SIZE)} registros • {formatNumber(parsedRows.length)}{' '}
                  total
                </p>
              </div>
            )}

            {/* Seletor de Modo de Importação (quando habilitado) */}
            {hasModos ? (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                  <span>Selecione o modo de importação:</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {selectedModo === 'atual'
                      ? 'Base ativa + roteamento histórico'
                      : 'Direto no histórico'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={selectedModo === 'atual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedModo('atual')
                      setResult(null)
                    }}
                    disabled={loading}
                    className={cn(
                      'text-xs font-semibold h-auto py-2 px-3 text-left justify-start flex-col items-start whitespace-normal leading-snug',
                      selectedModo === 'atual'
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          selectedModo === 'atual' ? 'bg-white' : 'bg-indigo-600',
                        )}
                      />
                      Importar dados atuais (Ano Atual e Ano Passado)
                    </span>
                    <span
                      className={cn(
                        'text-[10px] block mt-0.5 font-normal',
                        selectedModo === 'atual' ? 'text-indigo-100' : 'text-slate-500',
                      )}
                    >
                      Grava na base mestra; registros fora da janela vão ao histórico.
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant={selectedModo === 'historico' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedModo('historico')
                      setResult(null)
                    }}
                    disabled={loading}
                    className={cn(
                      'text-xs font-semibold h-auto py-2 px-3 text-left justify-start flex-col items-start whitespace-normal leading-snug',
                      selectedModo === 'historico'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-xs'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          selectedModo === 'historico' ? 'bg-white' : 'bg-amber-600',
                        )}
                      />
                      Importar dados anteriores ao Ano Passado
                    </span>
                    <span
                      className={cn(
                        'text-[10px] block mt-0.5 font-normal',
                        selectedModo === 'historico' ? 'text-amber-100' : 'text-slate-500',
                      )}
                    >
                      Direto em vendas_historico sem tocar a base mestra.
                    </span>
                  </Button>
                </div>

                {/* Botão de Disparo do Modo Escolhido */}
                <Button
                  onClick={() => {
                    if (confirmDialog) {
                      setConfirmOpen(true)
                    } else {
                      handleExecuteImport()
                    }
                  }}
                  disabled={loading || parsedRows.length === 0}
                  className={cn(
                    'w-full text-white font-semibold text-xs py-2 shadow-xs mt-1',
                    selectedModo === 'atual'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-amber-600 hover:bg-amber-700',
                  )}
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processando carga ({formatNumber(parsedRows.length)} registros)...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4 mr-1.5" />
                      {selectedModo === 'atual'
                        ? 'Importar dados atuais (Ano Atual e Ano Passado)'
                        : 'Importar dados anteriores ao Ano Passado'}{' '}
                      ({formatNumber(parsedRows.length)} linhas
                      {parsedRows.length > CHUNK_SIZE
                        ? ` • ${Math.ceil(parsedRows.length / CHUNK_SIZE)} lotes`
                        : ''}
                      )
                    </>
                  )}
                </Button>
              </div>
            ) : (
              /* Action button único para os outros cards */
              <Button
                onClick={() => {
                  if (confirmDialog) {
                    setConfirmOpen(true)
                  } else {
                    handleExecuteImport()
                  }
                }}
                disabled={loading || parsedRows.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 shadow-xs"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processando carga ({formatNumber(parsedRows.length)} registros)...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 mr-1.5" />
                    Importar {title} ({formatNumber(parsedRows.length)} linhas
                    {parsedRows.length > CHUNK_SIZE
                      ? ` • ${Math.ceil(parsedRows.length / CHUNK_SIZE)} lotes`
                      : ''}
                    )
                  </>
                )}
              </Button>
            )}

            {/* Diálogo de Confirmação de Substituição Completa da Base */}
            {confirmDialog && (
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <DialogTitle className="text-base font-bold text-slate-900">
                      {confirmDialog.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-1 whitespace-pre-line">
                      {confirmDialog.description}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="rounded-lg bg-amber-50/80 border border-amber-200/80 p-3 text-xs text-amber-900 space-y-1.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Registros atuais na base:</span>
                      <span className="tabular-nums font-bold text-slate-900">
                        {formatNumber(baseCount ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <span>Linhas no novo arquivo:</span>
                      <span className="tabular-nums font-bold text-indigo-700">
                        {formatNumber(parsedRows.length)}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 pt-1 border-t border-amber-200">
                      A base final refletirá exatamente o extrato mais recente do SAP. Pedidos que
                      saíram do relatório não permanecerão na base.
                    </p>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmOpen(false)}
                      disabled={loading}
                      className="text-xs"
                    >
                      {confirmDialog.cancelLabel || 'Cancelar'}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setConfirmOpen(false)
                        handleExecuteImport()
                      }}
                      disabled={loading}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs ml-2"
                    >
                      <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                      {confirmDialog.confirmLabel || 'Sim, substituir base'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}

        {/* Import Results Box */}
        {result && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              {batchResult && batchResult.failedBatches.length > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 text-cyan-600" />
                  <span className="text-cyan-700">Importação Parcial:</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Resultado da Carga:</span>
                </>
              )}
            </div>

            {batchResult && (
              <div className="text-[11px] text-slate-500">
                {batchResult.totalBatches} lote(s) processados
                {batchResult.failedBatches.length > 0 && (
                  <span className="text-rose-600 font-medium">
                    {' '}
                    • {batchResult.failedBatches.length} falhou(aram): lote(s){' '}
                    {batchResult.failedBatches.join(', ')}
                  </span>
                )}
              </div>
            )}

            {/* Resumo transparente: Arquivo → Base (ignorados) */}
            {parsedRows.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-md px-2 py-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">Arquivo:</span>
                <span className="tabular-nums font-medium">{formatNumber(parsedRows.length)}</span>
                <span className="text-slate-400">linhas</span>
                <ArrowRight className="w-3 h-3 text-slate-400 mx-0.5" />
                <span className="font-semibold text-slate-700">Base:</span>
                <span className="tabular-nums font-bold text-slate-900">
                  {formatNumber(baseCount ?? 0)}
                </span>
                <span className="text-slate-400">
                  ({parsedRows.length - (baseCount ?? 0) > 0 ? '+' : ''}
                  {formatNumber(parsedRows.length - (baseCount ?? 0))} vs arquivo)
                </span>
                {result.ignorados > 0 && (
                  <span className="text-cyan-600 font-medium ml-auto">
                    {formatNumber(result.ignorados)} ignorados
                  </span>
                )}
              </div>
            )}
            <div
              className={cn(
                'grid gap-2 text-center pt-1',
                (result.mesclados ?? 0) > 0 ? 'grid-cols-4' : 'grid-cols-3',
              )}
            >
              <div className="bg-white p-2 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Novos
                </span>
                <span className="text-sm font-bold text-emerald-600">{result.importados}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Atualizados
                </span>
                <span className="text-sm font-bold text-indigo-600">{result.atualizados}</span>
              </div>
              {(result.mesclados ?? 0) > 0 && (
                <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                  <span className="text-[10px] text-amber-700 uppercase font-semibold block">
                    Mesclados
                  </span>
                  <span className="text-sm font-bold text-amber-800">{result.mesclados}</span>
                </div>
              )}
              <div className="bg-white p-2 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Ignorados
                </span>
                <span className="text-sm font-bold text-cyan-600">{result.ignorados}</span>
              </div>
            </div>

            {/* Métricas de Histórico e Janela Dinâmica Aplicada */}
            {((result.roteados_historico ?? 0) > 0 ||
              (result.historico_importados ?? 0) > 0 ||
              (result.historico_atualizados ?? 0) > 0 ||
              result.janela) && (
              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-amber-700" />
                    Destino no Histórico (vendas_historico):
                  </span>
                  {result.janela && (
                    <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                      Janela: {result.janela.inicioISO} a {result.janela.fimISO}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center pt-0.5">
                  <div className="bg-white/80 p-1.5 rounded border border-amber-100">
                    <span className="text-[9px] text-amber-800 uppercase font-semibold block">
                      Roteados Histórico
                    </span>
                    <span className="text-xs font-bold text-amber-900">
                      {result.roteados_historico ?? 0}
                    </span>
                  </div>
                  <div className="bg-white/80 p-1.5 rounded border border-amber-100">
                    <span className="text-[9px] text-amber-800 uppercase font-semibold block">
                      Histórico Novos
                    </span>
                    <span className="text-xs font-bold text-amber-900">
                      {result.historico_importados ?? 0}
                    </span>
                  </div>
                  <div className="bg-white/80 p-1.5 rounded border border-amber-100">
                    <span className="text-[9px] text-amber-800 uppercase font-semibold block">
                      Histórico Atualiz.
                    </span>
                    <span className="text-xs font-bold text-amber-900">
                      {result.historico_atualizados ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Warning notice if expected columns (e.g. Nome do Canal) were missing */}
            {result.avisos && result.avisos.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <span className="text-[11px] font-semibold text-amber-700 block mb-1">
                  Avisos de Mapeamento:
                </span>
                <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-amber-800 bg-amber-50/80 p-2 rounded-md border border-amber-200">
                  {result.avisos.map((aviso, i) => (
                    <div key={i} className="leading-snug">
                      ⚠️ {aviso}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation errors list */}
            {result.erros && result.erros.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <span className="text-[11px] font-semibold text-rose-700 block mb-1">
                  Alertas / Erros de Validação ({result.erros.length}):
                </span>
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[10px] text-rose-600 font-mono bg-rose-50/50 p-1.5 rounded-md border border-rose-100">
                  {result.erros.map((err, i) => (
                    <div key={i} className="truncate">
                      • {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Importar() {
  const [counts, setCounts] = useState<{
    produtos: number
    racnew: number
    netsales: number
    vendas: number
    canais_clientes: number
    pedidos_abertos: number
    estoque_sap: number
    tipos_cliente?: number
    ultimaCarga: string | null
    ultimaCargaPedidosAbertos?: string | null
    ultimaCargaEstoqueSap?: string | null
    ultimaCargaTiposCliente?: string | null
  }>({
    produtos: 0,
    racnew: 0,
    netsales: 0,
    vendas: 0,
    canais_clientes: 0,
    pedidos_abertos: 0,
    estoque_sap: 0,
    tipos_cliente: 0,
    ultimaCarga: null,
    ultimaCargaPedidosAbertos: null,
    ultimaCargaEstoqueSap: null,
    ultimaCargaTiposCliente: null,
  })
  const [ultimaCargaPedidosAbertos, setUltimaCargaPedidosAbertos] = useState<string | null>(null)
  const [ultimaCargaEstoqueSap, setUltimaCargaEstoqueSap] = useState<string | null>(null)
  const [ultimaCargaTiposCliente, setUltimaCargaTiposCliente] = useState<string | null>(null)
  const [consolidating, setConsolidating] = useState(false)
  const [rebuildingSummaries, setRebuildingSummaries] = useState(false)
  const [summariesProgress, setSummariesProgress] = useState<{
    etapa: string
    percentual: number
    detalhe: string
  } | null>(null)
  const [consolidationResult, setConsolidationResult] = useState<ConsolidarResult | null>(null)
  const [consolidationProgress, setConsolidationProgress] = useState<
    import('@/types/sales').ConsolidacaoStatus | null
  >(null)
  const [consolidationError, setConsolidationError] = useState<string | null>(null)
  const [migrandoHistorico, setMigrandoHistorico] = useState(false)
  const [migracaoHistoricoStatus, setMigracaoHistoricoStatus] =
    useState<MigracaoHistoricoStatus | null>(null)
  const [migracaoHistoricoError, setMigracaoHistoricoError] = useState<string | null>(null)
  const [migracaoHistoricoResultado, setMigracaoHistoricoResultado] = useState<{
    registros_movidos: number
    total_historico: number
    duracao_s: number
  } | null>(null)
  // ===== Zeramento da Base (padrão do migrar_historico: lotes curtos + status persistido) =====
  const [zerarConfirmOpen, setZerarConfirmOpen] = useState(false)
  const [zerarConfirmText, setZerarConfirmText] = useState('')
  const [zerando, setZerando] = useState(false)
  const [zerarStatus, setZerarStatus] = useState<ZerarBaseStatus | null>(null)
  const [zerarContagens, setZerarContagens] = useState<Record<string, number> | null>(null)
  const [zerarError, setZerarError] = useState<string | null>(null)
  const [zerarResultado, setZerarResultado] = useState<{
    total_apagado: number
    apagado_por_colecao: Record<string, number>
    duracao_s: number
    nada_a_apagar?: boolean
  } | null>(null)
  // Resultado de cada importação armazenado separadamente por base
  const [importResults, setImportResults] = useState<{
    produtos?: ImportResult
    racnew?: ImportResult
    netsales?: ImportResult
    canais_clientes?: ImportResult
    pedidos_abertos?: ImportResult
    estoque_sap?: ImportResult
    tipos_cliente?: ImportResult
  }>({})
  const { toast } = useToast()

  const refreshCounts = async () => {
    try {
      const data = await getCountsSummary()
      setCounts(data)
      if (data.ultimaCargaPedidosAbertos) {
        setUltimaCargaPedidosAbertos(data.ultimaCargaPedidosAbertos)
      } else {
        // Fallback: consulta direta se a contagem não tiver
        const directDate = await fetchUltimaCargaPedidosAbertos()
        setUltimaCargaPedidosAbertos(directDate)
      }
      if (data.ultimaCargaEstoqueSap) {
        setUltimaCargaEstoqueSap(data.ultimaCargaEstoqueSap)
      } else {
        const directEstoqueDate = await fetchUltimaCargaEstoqueSap()
        setUltimaCargaEstoqueSap(directEstoqueDate)
      }
      if (data.ultimaCargaTiposCliente) {
        setUltimaCargaTiposCliente(data.ultimaCargaTiposCliente)
      } else {
        const directTcDate = await fetchUltimaCargaTiposCliente()
        setUltimaCargaTiposCliente(directTcDate)
      }
    } catch (err) {
      console.error('Erro ao buscar contagens:', err)
      const directDate = await fetchUltimaCargaPedidosAbertos()
      setUltimaCargaPedidosAbertos(directDate)
      const directEstoqueDate = await fetchUltimaCargaEstoqueSap()
      setUltimaCargaEstoqueSap(directEstoqueDate)
      const directTcDate = await fetchUltimaCargaTiposCliente()
      setUltimaCargaTiposCliente(directTcDate)
    }
  }

  useEffect(() => {
    refreshCounts()
    // Registrar acesso à tela de importação no audit_logs
    logAudit('import_access', 'Acesso à tela de Importação e Consolidação de Bases')
    // Restaura o estado persistido da migração do histórico (se houver)
    getMigracaoHistoricoStatus()
      .then((s) => {
        setMigracaoHistoricoStatus(s)
        if (s.status === 'completed' && s.registros_movidos > 0) {
          setMigracaoHistoricoResultado({
            registros_movidos: s.registros_movidos,
            total_historico: s.total_historico,
            duracao_s: 0,
          })
        }
      })
      .catch(() => {
        /* coleção ainda não existe ou backend indisponível — segue com estado inicial */
      })
    // Restaura o estado persistido do zeramento da base (se houver)
    getZerarBaseStatus()
      .then((res: ZerarBaseStatusResponse) => {
        setZerarStatus(res.status)
        setZerarContagens(res.contagens_atuais)
        if (res.status.status === 'completed' && res.status.total_apagado > 0) {
          setZerarResultado({
            total_apagado: res.status.total_apagado,
            apagado_por_colecao: res.status.apagado_por_colecao || {},
            duracao_s:
              res.status.started_at && res.status.finished_at
                ? Math.max(
                    0,
                    Math.round(
                      (new Date(res.status.finished_at).getTime() -
                        new Date(res.status.started_at).getTime()) /
                        1000,
                    ),
                  )
                : 0,
          })
        }
      })
      .catch(() => {
        /* endpoint indisponível — card segue com estado inicial */
      })
  }, [])

  const handleConsolidar = async () => {
    setConsolidating(true)
    setConsolidationError(null)
    setConsolidationProgress(null)
    try {
      // Etapa 1: Carga em lotes seguros e progressivos na tabela vendas
      const res = await consolidarVendasApi({
        onProgress: (status) => {
          setConsolidationProgress(status)
        },
      })
      setConsolidationResult(res)
      await refreshCounts()

      toast({
        title: 'Carga de Vendas Concluída!',
        description: `${formatNumber(res.total_consolidado)} vendas consolidadas. Reconstruindo resumos analíticos...`,
      })

      // Etapa 2: Reconstrução dos 3 resumos pré-calculados em etapas progressivas
      setRebuildingSummaries(true)
      setSummariesProgress({
        etapa: 'iniciar',
        percentual: 2,
        detalhe: 'Iniciando reconstrução de resumos analíticos...',
      })
      try {
        const resumoRes = await reconstruirResumosApi((p) => {
          setSummariesProgress(p)
        })
        toast({
          title: 'Consolidação e Resumos Finalizados!',
          description: `${formatNumber(res.total_consolidado)} vendas consolidadas e resumos mensais atualizados (${resumoRes.durationMs}ms).`,
        })
      } catch (resumoErr: unknown) {
        const resumoData =
          (resumoErr as { data?: { error?: string; stage?: string } })?.data ||
          (resumoErr as { response?: { error?: string; stage?: string } })?.response
        const rawResumoMsg =
          resumoData?.error || (resumoErr as Error)?.message || 'Falha na reconstrução de resumos'
        const stageResumo = resumoData?.stage || summariesProgress?.etapa

        const resumoMsg = stageResumo ? `[Etapa: ${stageResumo}] ${rawResumoMsg}` : rawResumoMsg

        console.error('Erro na etapa de reconstrução de resumos:', resumoErr)
        setConsolidationError(
          `Carga concluída (${formatNumber(res.total_consolidado)} registros), porém a reconstrução de resumos falhou: ${resumoMsg}`,
        )
        toast({
          variant: 'destructive',
          title: 'Aviso: Resumos Pendentes',
          description: `Vendas gravadas com sucesso, mas resumos falharam: ${resumoMsg}`,
        })
      } finally {
        setRebuildingSummaries(false)
        setSummariesProgress(null)
      }
    } catch (err: unknown) {
      const backendData =
        (err as { data?: { error?: string; message?: string; stage?: string; lote?: number } })
          ?.data ||
        (err as { response?: { error?: string; message?: string; stage?: string; lote?: number } })
          ?.response

      let rawMsg =
        backendData?.error ||
        backendData?.message ||
        (err as Error)?.message ||
        'Falha na consolidação de vendas'

      const stage = backendData?.stage || consolidationProgress?.etapa
      const lote =
        backendData?.lote ||
        (consolidationProgress?.lote_atual ? consolidationProgress.lote_atual + 1 : undefined)

      // Se a mensagem vier como genérica "Something went wrong", tenta buscar do backend o status gravado
      if (rawMsg.includes('Something went wrong')) {
        try {
          const freshStatus = await getConsolidacaoStatusApi()
          if (
            freshStatus.status?.erro &&
            !freshStatus.status.erro.includes('Something went wrong')
          ) {
            rawMsg = freshStatus.status.erro
          } else if (
            freshStatus.status?.mensagem &&
            !freshStatus.status.mensagem.includes('Something went wrong')
          ) {
            rawMsg = freshStatus.status.mensagem
          }
        } catch {
          /* intentionally ignored */
        }
      }

      let errorMsg = rawMsg
      if (!errorMsg.includes('Falha na') && !errorMsg.includes('Falha ao')) {
        errorMsg = `Falha na consolidação${stage ? ` na etapa [${stage}]` : ''}${lote ? ` (Lote ${lote})` : ''}: ${errorMsg}`
      }

      console.error('Erro na consolidação:', err)
      setConsolidationError(errorMsg)
      toast({
        variant: 'destructive',
        title: 'Falha na Consolidação de Vendas',
        description: errorMsg,
      })
    } finally {
      setConsolidating(false)
    }
  }

  // ETAPA 1 da segregação: move registros < 2025-01-01 de `vendas` para
  // `vendas_historico`, em lotes curtos (mesmo padrão da consolidação).
  const handleMigrarHistorico = async () => {
    setMigrandoHistorico(true)
    setMigracaoHistoricoError(null)
    setMigracaoHistoricoResultado(null)
    try {
      const res = await migrarHistoricoApi({
        onProgress: (s) => setMigracaoHistoricoStatus(s),
      })
      const totalHist = res.status.total_historico
      setMigracaoHistoricoResultado({
        registros_movidos: res.registros_movidos,
        total_historico: totalHist,
        duracao_s: res.duracao_ms ? Math.round(res.duracao_ms / 1000) : 0,
      })
      setMigracaoHistoricoStatus(res.status)
      logAudit(
        'migracao_historico',
        `Migração histórico (< 2025): ${res.registros_movidos} registros movidos para vendas_historico (${totalHist} no total).`,
      )
      toast({
        title: 'Migração do Histórico Concluída!',
        description: `${formatNumber(res.registros_movidos)} registros anteriores a jan/2025 movidos para a base histórica (${formatNumber(totalHist)} no histórico). Nada mais será movido — a execução é idempotente.`,
      })
      refreshCounts()
    } catch (err: unknown) {
      const errObj = err as {
        data?: { error?: string; message?: string; stage?: string }
        response?: { error?: string; message?: string; stage?: string }
        message?: string
      }
      const backendData = errObj?.data || errObj?.response
      const msg =
        backendData?.error ||
        backendData?.message ||
        errObj?.message ||
        'Falha na migração do histórico'
      console.error('Erro na migração do histórico:', err)
      setMigracaoHistoricoError(msg)
      // Persiste o estado de erro para que a próxima visita à tela saiba o que aconteceu
      getMigracaoHistoricoStatus()
        .then((s) => setMigracaoHistoricoStatus(s))
        .catch(() => undefined)
      toast({
        variant: 'destructive',
        title: 'Falha na Migração do Histórico',
        description: msg,
      })
    } finally {
      setMigrandoHistorico(false)
    }
  }

  const handleReconstruirResumosApenas = async () => {
    setRebuildingSummaries(true)
    setConsolidationError(null)
    setSummariesProgress({
      etapa: 'iniciar',
      percentual: 2,
      detalhe: 'Iniciando reconstrução de resumos analíticos...',
    })
    try {
      const resumoRes = await reconstruirResumosApi((p) => {
        setSummariesProgress(p)
      })
      toast({
        title: 'Resumos Reconstruídos!',
        description: `Tabelas analíticas de resumo atualizadas com sucesso (${resumoRes.durationMs}ms).`,
      })
    } catch (err: unknown) {
      const errData =
        (err as { data?: { error?: string; stage?: string } })?.data ||
        (err as { response?: { error?: string; stage?: string } })?.response
      const rawMsg = errData?.error || (err as Error)?.message || 'Falha na reconstrução de resumos'
      const stage = errData?.stage || summariesProgress?.etapa
      const errorMsg = stage ? `[Etapa: ${stage}] ${rawMsg}` : rawMsg

      setConsolidationError(errorMsg)
      toast({
        variant: 'destructive',
        title: 'Erro na Reconstrução de Resumos',
        description: errorMsg,
      })
    } finally {
      setRebuildingSummaries(false)
      setSummariesProgress(null)
    }
  }

  // ===== Zeramento da Base de Dados =====
  const zerarAlvos = [
    'vendas',
    'vendas_historico',
    'racnew',
    'netsales',
    'pedidos_abertos',
    'estoque_sap',
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
    'vendas_staging',
    'vendas_consolidacao_status',
    'vendas_migracao_historico_status',
  ]

  const zerarTotalAtual = zerarContagens
    ? zerarAlvos.reduce((acc, t) => acc + (zerarContagens[t] || 0), 0)
    : 0

  const handleZerarBase = async () => {
    setZerando(true)
    setZerarError(null)
    setZerarResultado(null)
    try {
      const res = await zerarBaseApi({
        onProgress: (s) => {
          setZerarStatus(s)
          if (s.status === 'in_progress') setZerarConfirmOpen(false)
        },
      })
      setZerarStatus(res.status)
      setZerarResultado({
        total_apagado: res.total_apagado,
        apagado_por_colecao: res.apagado_por_colecao || {},
        duracao_s: res.duracao_ms ? Math.round(res.duracao_ms / 1000) : 0,
        nada_a_apagar: res.nada_a_apagar,
      })
      logAudit(
        'zerar_base',
        `Zeramento da base: ${res.total_apagado} registros apagados${
          res.nada_a_apagar ? ' (nada a apagar — base já vazia)' : ''
        }.`,
      )
      toast({
        title: res.nada_a_apagar ? 'Base já estava vazia' : 'Zeramento da Base Concluído!',
        description: res.nada_a_apagar
          ? 'Nada a apagar — todas as coleções transacionais já estavam vazias (execução idempotente).'
          : `${formatNumber(res.total_apagado)} registros apagados. Produtos, Tipos de Cliente, Canais, Metas e usuários permanecem intactos. Cache do dashboard invalidado.`,
      })
      setZerarConfirmOpen(false)
      setZerarConfirmText('')
      refreshCounts()
    } catch (err: unknown) {
      const errObj = err as {
        data?: { error?: string; message?: string; stage?: string }
        response?: { error?: string; message?: string; stage?: string }
        message?: string
      }
      const backendData = errObj?.data || errObj?.response
      const msg =
        backendData?.error ||
        backendData?.message ||
        errObj?.message ||
        'Falha no zeramento da base'
      console.error('Erro no zeramento da base:', err)
      setZerarError(msg)
      getZerarBaseStatus()
        .then((s) => {
          setZerarStatus(s.status)
          setZerarContagens(s.contagens_atuais)
        })
        .catch(() => undefined)
      toast({
        variant: 'destructive',
        title: 'Falha no Zeramento da Base',
        description: msg,
      })
    } finally {
      setZerando(false)
    }
  }

  // Callback disparado ao final de cada importação: armazena o resultado
  // desta base específica e atualiza o "Total na base" consultando o backend.
  const handleImported = (base: BaseKey, result: ImportResult) => {
    setImportResults((prev) => ({ ...prev, [base]: result }))
    refreshCounts()
    if (base === 'pedidos_abertos') {
      if (result.data_carga) {
        setUltimaCargaPedidosAbertos(result.data_carga)
      } else {
        fetchUltimaCargaPedidosAbertos().then((d) => {
          if (d) setUltimaCargaPedidosAbertos(d)
        })
      }
      logAudit(
        'pedidos_abertos_import',
        `Importação SAP: ${result.importados ?? 0} novos, ${result.atualizados ?? 0} atualizados, ${result.ignorados ?? 0} ignorados`,
      )
    } else if (base === 'estoque_sap') {
      if (result.data_carga) {
        setUltimaCargaEstoqueSap(result.data_carga)
      } else {
        fetchUltimaCargaEstoqueSap().then((d) => {
          if (d) setUltimaCargaEstoqueSap(d)
        })
      }
      logAudit(
        'estoque_sap_import',
        `Estoque Real (SAP): ${result.importados ?? 0} novos, ${result.atualizados ?? 0} atualizados, ${result.mesclados ?? 0} mesclados, ${result.ignorados ?? 0} ignorados`,
      )
    } else if (base === 'tipos_cliente') {
      if (result.data_carga) {
        setUltimaCargaTiposCliente(result.data_carga)
      } else {
        fetchUltimaCargaTiposCliente().then((d) => {
          if (d) setUltimaCargaTiposCliente(d)
        })
      }
      logAudit(
        'tipos_cliente_import',
        `Tipos de Cliente (SAP): ${result.importados ?? 0} novos, ${result.atualizados ?? 0} atualizados, ${result.mesclados ?? 0} mesclados, ${result.ignorados ?? 0} ignorados`,
      )
    }
  }

  const summaryEntries: { base: BaseKey; label: string; color: string }[] = [
    { base: 'produtos', label: 'Produtos', color: 'text-cyan-700' },
    { base: 'racnew', label: 'RacNew', color: 'text-indigo-700' },
    { base: 'netsales', label: 'NetSales', color: 'text-teal-700' },
    { base: 'canais_clientes', label: 'Canais x Clientes', color: 'text-sky-700' },
    { base: 'pedidos_abertos', label: 'Pedidos em Aberto', color: 'text-amber-700' },
    { base: 'estoque_sap', label: 'Posição Estoque (SAP)', color: 'text-emerald-700' },
    { base: 'tipos_cliente', label: 'Tipo de Cliente (SAP)', color: 'text-purple-700' },
  ]
  const hasAnyImportResult = Object.values(importResults).some((r) => r)

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Overview Card: Consolidação */}
      <Card className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-900 to-slate-900 text-white shadow-md overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 text-xs font-semibold border border-indigo-400/30">
                <Layers className="w-3.5 h-3.5" />
                Motor de Consolidação Automático
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Consolidação Inteligente de Vendas
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                A <strong>RacNew</strong> é a base mestra. A junção com a <strong>NetSales</strong>{' '}
                vincula Número SAP ↔ Chave Documento, Nº NFe ↔ Serial, Data ↔ DOCDATE, Cód. Cliente
                e Cód. do Item, adicionando os 12 campos exclusivos. A categoria do item é trazida
                da base de <strong>Produtos</strong>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                size="lg"
                onClick={handleConsolidar}
                disabled={consolidating || rebuildingSummaries}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-6 rounded-xl shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
              >
                {consolidating ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    {consolidationProgress?.total_lotes
                      ? `Consolidando (Lote ${consolidationProgress.lote_atual}/${consolidationProgress.total_lotes})...`
                      : 'Consolidação iniciada, aguarde...'}
                  </>
                ) : rebuildingSummaries ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    Reconstruindo Resumos...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    Consolidar Vendas Agora
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleReconstruirResumosApenas}
                disabled={consolidating || rebuildingSummaries}
                className="border-indigo-400/40 text-indigo-200 hover:bg-indigo-800/40 hover:text-white text-xs h-12 px-4 rounded-xl"
                title="Reconstrói apenas as tabelas analíticas pré-calculadas a partir da base consolidada existente"
              >
                {rebuildingSummaries ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin mr-1.5" />
                    Reconstruindo...
                  </>
                ) : (
                  <>
                    <RotateCw className="w-4 h-4 mr-1.5" />
                    Reconstruir Resumos
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Barra de Progresso / Status da Consolidação */}
          {consolidating && consolidationProgress && (
            <div className="mt-4 p-4 rounded-xl bg-indigo-950/80 border border-indigo-400/40 text-indigo-100 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                  {consolidationProgress.mensagem || 'Processando lotes em segundo plano...'}
                </span>
                <span className="text-indigo-300 font-mono text-xs">
                  {consolidationProgress.total_lotes > 0
                    ? `${Math.round(
                        (consolidationProgress.lote_atual / consolidationProgress.total_lotes) *
                          100,
                      )}%`
                    : 'Iniciando...'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      consolidationProgress.total_lotes > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (consolidationProgress.lote_atual /
                                consolidationProgress.total_lotes) *
                                100,
                            ),
                          )
                        : 5
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span>
                  Lote: {consolidationProgress.lote_atual} / {consolidationProgress.total_lotes} |
                  Etapa: {consolidationProgress.etapa || 'iniciando'}
                </span>
                <span>
                  {formatNumber(consolidationProgress.registros_processados)} /{' '}
                  {formatNumber(consolidationProgress.total_registros)} registros
                </span>
              </div>
            </div>
          )}

          {/* Barra de Progresso / Status da Reconstrução de Resumos */}
          {rebuildingSummaries && summariesProgress && (
            <div className="mt-4 p-4 rounded-xl bg-teal-950/80 border border-teal-400/40 text-teal-100 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-teal-400" />
                  {summariesProgress.detalhe || 'Atualizando resumos analíticos...'}
                </span>
                <span className="text-teal-300 font-mono text-xs">
                  {summariesProgress.percentual}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-teal-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(5, summariesProgress.percentual))}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-teal-200/80 font-mono">
                <span>Etapa: {summariesProgress.etapa}</span>
                <span>Pré-cálculo de alta performance</span>
              </div>
            </div>
          )}

          {/* Mensagem de Erro Real do Backend */}
          {consolidationError && (
            <div className="mt-4 p-4 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs sm:text-sm flex items-start gap-3">
              <span className="font-bold text-red-400 shrink-0 uppercase tracking-wide text-[11px] bg-red-900/80 px-2 py-0.5 rounded border border-red-700">
                Falha na Consolidação
              </span>
              <p className="flex-1 font-mono text-xs break-all leading-relaxed">
                {consolidationError}
              </p>
            </div>
          )}

          {/* Counts metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-slate-800/80">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block font-medium">
                Produtos Cadastrados
              </span>
              <span className="text-lg font-bold text-white tabular-nums">
                {formatNumber(counts.produtos)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block font-medium">
                Registros RacNew (Mestre)
              </span>
              <span className="text-lg font-bold text-indigo-300 tabular-nums">
                {formatNumber(counts.racnew)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-slate-400 block font-medium">
                Registros NetSales
              </span>
              <span className="text-lg font-bold text-teal-300 tabular-nums">
                {formatNumber(counts.netsales)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-sky-300 block font-medium">Canais x Clientes</span>
              <span className="text-lg font-bold text-sky-200 tabular-nums">
                {formatNumber(counts.canais_clientes ?? 0)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-amber-300 block font-medium">
                Pedidos em Aberto
              </span>
              <span className="text-lg font-bold text-amber-200 tabular-nums">
                {formatNumber(counts.pedidos_abertos ?? 0)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-emerald-300 block font-medium">
                Posição Estoque (SAP)
              </span>
              <span className="text-lg font-bold text-emerald-200 tabular-nums">
                {formatNumber(counts.estoque_sap ?? 0)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-[11px] text-purple-300 block font-medium">
                Tipos de Cliente (SAP)
              </span>
              <span className="text-lg font-bold text-purple-200 tabular-nums">
                {formatNumber(counts.tipos_cliente ?? 0)}
              </span>
            </div>
            <div className="bg-indigo-950/80 p-3 rounded-lg border border-indigo-700/50">
              <span className="text-[11px] text-indigo-300 block font-semibold">
                Vendas Consolidadas
              </span>
              <span className="text-lg font-bold text-white tabular-nums">
                {formatNumber(counts.vendas)}
              </span>
            </div>
          </div>

          {/* Última carga */}
          {counts.ultimaCarga && (
            <div className="mt-3 text-[11px] text-slate-400">
              Última consolidação: {formatDateTime(counts.ultimaCarga)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zeramento da Base de Dados — apaga coleções transacionais sob confirmação explícita */}
      <Card className="rounded-xl border border-red-200/80 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-red-600" />
            Zerar Base de Dados
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Apaga <strong>TODOS</strong> os registros das coleções transacionais (
            <code className="text-[10px]">vendas</code>,{' '}
            <code className="text-[10px]">vendas_historico</code>,{' '}
            <code className="text-[10px]">racnew</code>,{' '}
            <code className="text-[10px]">netsales</code>,{' '}
            <code className="text-[10px]">pedidos_abertos</code>,{' '}
            <code className="text-[10px]">estoque_sap</code>, logs de auditoria, resumos
            pré-calculados e tabelas de controle).{' '}
            <strong className="text-red-700">
              Produtos, Tipos de Cliente, Canais, Metas e usuários permanecem intactos.
            </strong>{' '}
            Nada é apagado automaticamente — só quando você confirmar abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Lista do que será apagado, com contagem atual por coleção (do status) */}
          <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3">
            <p className="text-[11px] font-semibold text-slate-700 mb-2">
              O que será apagado (contagem atual):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {zerarContagens ? (
                zerarAlvos.map((t) => (
                  <div
                    key={t}
                    className="flex items-center justify-between gap-2 bg-white rounded border border-slate-200 px-2 py-1"
                  >
                    <code className="text-[10px] text-slate-600 truncate">{t}</code>
                    <span className="text-[10px] font-bold text-slate-800 tabular-nums shrink-0">
                      {formatNumber(zerarContagens[t] || 0)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[11px] text-slate-500 col-span-full">
                  Carregando contagens...
                </span>
              )}
            </div>
            {zerarContagens && (
              <p className="mt-2 text-[11px] text-slate-600">
                Total nos alvos:{' '}
                <span className="font-bold text-red-700">{formatNumber(zerarTotalAtual)}</span>{' '}
                registros.{' '}
                {zerarTotalAtual === 0 && (
                  <span className="text-emerald-700 font-semibold">
                    Base já vazia — executar agora apenas confirma a conclusão (idempotente).
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-[11px] text-slate-600 space-y-1">
              {zerarStatus?.status === 'completed' && zerarStatus.finished_at && (
                <p className="text-emerald-700">
                  Último zeramento concluído: {formatDateTime(zerarStatus.finished_at)}
                </p>
              )}
            </div>
            <Button
              size="lg"
              onClick={() => {
                setZerarConfirmText('')
                setZerarConfirmOpen(true)
              }}
              disabled={zerando || consolidating || rebuildingSummaries || migrandoHistorico}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-6 rounded-xl shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 shrink-0"
            >
              {zerando ? (
                <>
                  <RotateCw className="w-5 h-5 animate-spin" />
                  Zerando base...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  Zerar Base de Dados
                </>
              )}
            </Button>
          </div>

          {/* Progresso do zeramento (lote a lote) */}
          {zerando && zerarStatus && (
            <div className="p-4 rounded-xl bg-red-950/90 border border-red-400/40 text-red-100 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-red-400" />
                  {zerarStatus.mensagem || 'Apagando registros em lotes...'}
                </span>
                <span className="text-red-300 font-mono text-xs">
                  {zerarStatus.total_planejado > 0
                    ? `${Math.min(
                        100,
                        Math.round((zerarStatus.total_apagado / zerarStatus.total_planejado) * 100),
                      )}%`
                    : 'Concluindo...'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-red-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      zerarStatus.total_planejado > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (zerarStatus.total_apagado / zerarStatus.total_planejado) * 100,
                            ),
                          )
                        : 100
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-red-200/80 font-mono">
                <span>
                  Apagados: {formatNumber(zerarStatus.total_apagado)} | Planejado:{' '}
                  {formatNumber(zerarStatus.total_planejado)}
                </span>
                <span>Coleção: {zerarStatus.colecao_atual || '—'}</span>
              </div>
            </div>
          )}

          {/* Conclusão explícita e persistida (totais por coleção + duração) */}
          {zerarResultado && !zerando && (
            <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-400/50 text-emerald-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                {zerarResultado.nada_a_apagar
                  ? 'Zeramento CONCLUÍDO — nada a apagar (base já estava vazia)'
                  : 'Zeramento da base CONCLUÍDO — estado salvo no backend'}
              </div>
              {!zerarResultado.nada_a_apagar && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(zerarResultado.apagado_por_colecao).map(([t, n]) => (
                    <div
                      key={t}
                      className="flex items-center justify-between gap-2 bg-emerald-900/40 rounded border border-emerald-700/50 px-2 py-1"
                    >
                      <code className="text-[10px] text-emerald-200 truncate">{t}</code>
                      <span className="text-[10px] font-bold text-emerald-100 tabular-nums shrink-0">
                        {formatNumber(n)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-emerald-100/90">
                {zerarResultado.nada_a_apagar ? (
                  'Todas as coleções transacionais já estavam vazias — nada foi apagado.'
                ) : (
                  <>
                    Total apagado:{' '}
                    <span className="font-bold">{formatNumber(zerarResultado.total_apagado)}</span>{' '}
                    registros.
                  </>
                )}
                {zerarResultado.duracao_s > 0 ? ` Duração: ${zerarResultado.duracao_s}s.` : ''}{' '}
                Cache do dashboard invalidado.
              </p>
              <p className="text-[11px] text-emerald-200/70">
                Rodar novamente NÃO apaga nada (execução idempotente — responde "nada a apagar").
              </p>
            </div>
          )}

          {/* Erro persistido do zeramento */}
          {zerarError && (
            <div className="p-4 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs sm:text-sm flex items-start gap-3">
              <span className="font-bold text-red-400 shrink-0 uppercase tracking-wide text-[11px] bg-red-900/80 px-2 py-0.5 rounded border border-red-700">
                Falha no Zeramento
              </span>
              <p className="flex-1 font-mono text-xs break-all leading-relaxed">{zerarError}</p>
            </div>
          )}
          {!zerarError && !zerando && zerarStatus?.status === 'error' && zerarStatus.erro && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Última execução falhou (estado salvo no backend)
              </span>
              <p className="mt-1 font-mono text-[11px] break-all">{zerarStatus.erro}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de confirmação explícita do zeramento (digitar "ZERAR") */}
      <Dialog
        open={zerarConfirmOpen}
        onOpenChange={(open) => !open && !zerando && setZerarConfirmOpen(open)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Zerar Base de Dados — ação irreversível
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs space-y-2 text-slate-600">
                <p>
                  Isto apaga <strong>permanentemente</strong> todos os registros das coleções
                  transacionais listadas abaixo. Esta ação <strong>não pode ser desfeita</strong>.
                </p>
                {zerarContagens && (
                  <div className="max-h-40 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 space-y-0.5">
                    {zerarAlvos.map((t) => (
                      <div key={t} className="flex items-center justify-between gap-2 text-[10px]">
                        <code className="text-slate-600">{t}</code>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {formatNumber(zerarContagens[t] || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p>
                  <strong>NÃO serão apagados:</strong> Produtos, Tipos de Cliente, Canais, Canais ×
                  Clientes, Metas dos canais e usuários.
                </p>
                <p>
                  Para confirmar, digite <code className="font-bold text-red-700">ZERAR</code> no
                  campo abaixo:
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={zerarConfirmText}
            onChange={(e) => setZerarConfirmText(e.target.value)}
            placeholder='Digite "ZERAR" para confirmar'
            disabled={zerando}
            className="font-mono"
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setZerarConfirmOpen(false)} disabled={zerando}>
              Cancelar
            </Button>
            <Button
              onClick={handleZerarBase}
              disabled={zerando || zerarConfirmText.trim().toUpperCase() !== 'ZERAR'}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {zerando ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Zerando...
                </>
              ) : (
                'Confirmar Zeramento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Migração do Histórico (< 2025) — ETAPA 1 da segregação de dados */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-600" />
            Migração do Histórico (&lt; 2025)
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            ETAPA 1 da segregação de dados: move os registros de{' '}
            <code className="text-[10px]">vendas</code> com data de lançamento anterior a{' '}
            <strong>jan/2025</strong> para a base histórica separada{' '}
            <code className="text-[10px]">vendas_historico</code>. Nada é movido automaticamente — a
            movimentação só acontece quando você clicar no botão.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-[11px] text-slate-600 space-y-1">
              <p>
                <span className="font-semibold text-slate-800">Base ativa:</span>{' '}
                {formatNumber(counts.vendas)} registros em <code>vendas</code>
              </p>
              {migracaoHistoricoStatus?.total_historico ? (
                <p>
                  <span className="font-semibold text-slate-800">Base histórica:</span>{' '}
                  {formatNumber(migracaoHistoricoStatus.total_historico)} registros em{' '}
                  <code>vendas_historico</code>
                </p>
              ) : null}
              {migracaoHistoricoStatus?.status === 'completed' &&
              migracaoHistoricoStatus.finished_at ? (
                <p className="text-emerald-700">
                  Última conclusão: {formatDateTime(migracaoHistoricoStatus.finished_at)}
                </p>
              ) : null}
            </div>
            <Button
              size="lg"
              onClick={handleMigrarHistorico}
              disabled={migrandoHistorico || consolidating || rebuildingSummaries}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-6 rounded-xl shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 shrink-0"
            >
              {migrandoHistorico ? (
                <>
                  <RotateCw className="w-5 h-5 animate-spin" />
                  {migracaoHistoricoStatus?.registros_pendentes
                    ? `Movendo histórico (${formatNumber(migracaoHistoricoStatus.registros_movidos)} movidos, ${formatNumber(migracaoHistoricoStatus.registros_pendentes)} restantes)...`
                    : 'Migração iniciada, aguarde...'}
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-white" />
                  Migrar Histórico (&lt; 2025)
                </>
              )}
            </Button>
          </div>

          {/* Progresso da migração */}
          {migrandoHistorico && migracaoHistoricoStatus && (
            <div className="p-4 rounded-xl bg-amber-950/90 border border-amber-400/40 text-amber-100 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-amber-400" />
                  {migracaoHistoricoStatus.mensagem || 'Movendo registros em lotes...'}
                </span>
                <span className="text-amber-300 font-mono text-xs">
                  {migracaoHistoricoStatus.registros_pendentes > 0
                    ? `${Math.round(
                        (migracaoHistoricoStatus.registros_movidos /
                          (migracaoHistoricoStatus.registros_movidos +
                            migracaoHistoricoStatus.registros_pendentes)) *
                          100,
                      )}%`
                    : 'Concluindo...'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      migracaoHistoricoStatus.registros_pendentes > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (migracaoHistoricoStatus.registros_movidos /
                                (migracaoHistoricoStatus.registros_movidos +
                                  migracaoHistoricoStatus.registros_pendentes)) *
                                100,
                            ),
                          )
                        : 100
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-200/80 font-mono">
                <span>
                  Movidos: {formatNumber(migracaoHistoricoStatus.registros_movidos)} | Restantes:{' '}
                  {formatNumber(migracaoHistoricoStatus.registros_pendentes)}
                </span>
                <span>Etapa: {migracaoHistoricoStatus.etapa || 'processando'}</span>
              </div>
            </div>
          )}

          {/* Conclusão explícita e persistida (o usuário reclamou que a tela não confirmava) */}
          {migracaoHistoricoResultado && !migrandoHistorico && (
            <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-400/50 text-emerald-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Migração do histórico CONCLUÍDA — estado salvo no backend
              </div>
              <p className="text-xs text-emerald-100/90">
                {formatNumber(migracaoHistoricoResultado.registros_movidos)} registros anteriores a
                jan/2025 saíram de <code>vendas</code> e constam agora em{' '}
                <code>vendas_historico</code> (
                {formatNumber(migracaoHistoricoResultado.total_historico)} registros no total
                histórico).
                {migracaoHistoricoResultado.duracao_s > 0
                  ? ` Duração: ${migracaoHistoricoResultado.duracao_s}s.`
                  : ''}
              </p>
              <p className="text-[11px] text-emerald-200/70">
                Rodar novamente NÃO move nem duplica nada (execução idempotente).
              </p>
            </div>
          )}

          {/* Estado persistido: já concluída em execução anterior */}
          {!migracaoHistoricoResultado &&
            !migrandoHistorico &&
            migracaoHistoricoStatus?.status === 'completed' &&
            migracaoHistoricoStatus.registros_movidos > 0 && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Migração concluída em sessão anterior
                </span>
                <p className="mt-1 text-emerald-800">
                  {formatNumber(migracaoHistoricoStatus.registros_movidos)} registros movidos para{' '}
                  <code>vendas_historico</code>. Reexecutar não altera nada.
                </p>
              </div>
            )}

          {/* Erro persistido da migração */}
          {migracaoHistoricoError && (
            <div className="p-4 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs sm:text-sm flex items-start gap-3">
              <span className="font-bold text-red-400 shrink-0 uppercase tracking-wide text-[11px] bg-red-900/80 px-2 py-0.5 rounded border border-red-700">
                Falha na Migração
              </span>
              <p className="flex-1 font-mono text-xs break-all leading-relaxed">
                {migracaoHistoricoError}
              </p>
            </div>
          )}
          {!migracaoHistoricoError &&
            !migrandoHistorico &&
            migracaoHistoricoStatus?.status === 'error' &&
            migracaoHistoricoStatus.erro && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Última execução falhou (estado salvo no backend)
                </span>
                <p className="mt-1 font-mono text-[11px] break-all">
                  {migracaoHistoricoStatus.erro}
                </p>
              </div>
            )}
        </CardContent>
      </Card>

      {/* 6 Import Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
        {/* Card 1: Produtos */}
        <BaseImportCard
          title="Produtos"
          subtitle="Catálogo de itens e categorias"
          badgeLabel="Produtos"
          badgeColor="bg-cyan-600"
          expectedColumns={['codigo_item', 'descricao_item', 'grupo_item', 'ativo']}
          onImport={(rows) => importProdutosApi(rows)}
          baseCount={counts.produtos}
          onImported={(r) => handleImported('produtos', r)}
        />

        {/* Card 2: RacNew */}
        <BaseImportCard
          title="RacNew (Base Mestre)"
          subtitle="Dados fiscais e financeiros oficiais"
          badgeLabel="RacNew (Mestre)"
          badgeColor="bg-indigo-600"
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Ferramentas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">03-Vendas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-medium text-slate-700">
                    Faturamento de Vendas RAC - New 2
                  </span>
                </li>
                <li className="flex items-center gap-1">
                  <span>Botão direito no # da tabela</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Copiar Tabela</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Colar no Excel</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Salve em um local e realize a importação do arquivo: RacNew (SAP)</span>
                </li>
              </ol>
              <div className="pt-1 border-t border-slate-200/60 font-mono text-[9px] text-slate-500 break-words leading-tight select-all">
                SAP &gt; Ferramentas &gt; Consultas &gt; Gerenciador de Consultas &gt; 03-Vendas
                &gt; Faturamento de Vendas RAC - New 2 &gt; Botão direito no # da tabela &gt; Copiar
                Tabela &gt; Colar no Excel &gt; Salve em um local e realize a importação do arquivo:
                RacNew (SAP)
              </div>
            </div>
          }
          expectedColumns={[
            'numero_sap',
            'numero_nfe',
            'data_lancamento',
            'codigo_cliente',
            'nome_cliente',
            'codigo_item',
            'quantidade',
            'total_linha',
            'nome_vendedor',
            'utilizacao',
            'estado',
            'cidade',
          ]}
          hasModos
          onImport={(rows, _batchMeta, modo) => importRacNewApi(rows, modo || 'atual')}
          baseCount={counts.racnew}
          onImported={(r) => handleImported('racnew', r)}
        />

        {/* Card 3: NetSales */}
        <BaseImportCard
          title="NetSales (Base Mestre)"
          subtitle="Campos comerciais e custos complementares"
          badgeLabel="NetSales"
          badgeColor="bg-teal-600"
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Ferramentas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Financeiro</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-medium text-slate-700">
                    Consultas Net Sales_v4 - Revenda
                  </span>
                </li>
                <li className="flex items-center gap-1">
                  <span>Botão direito no # da tabela</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Copiar Tabela</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Colar no Excel</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Salve em um local e realize a importação do arquivo: NetSales (SAP)</span>
                </li>
              </ol>
              <div className="pt-1 border-t border-slate-200/60 font-mono text-[9px] text-slate-500 break-words leading-tight select-all">
                SAP &gt; Ferramentas &gt; Consultas &gt; Gerenciador de Consultas &gt; Financeiro
                &gt; Consultas Net Sales_v4 - Revenda &gt; Botão direito no # da tabela &gt; Copiar
                Tabela &gt; Colar no Excel &gt; Salve em um local e realize a importação do arquivo:
                NetSales (SAP)
              </div>
            </div>
          }
          expectedColumns={[
            'chave_documento',
            'serial',
            'docdate',
            'codigo_cliente',
            'codigo_item',
            'grupo_cliente',
            'mercado',
            'usuario_emissor',
            'valor_liquido',
            'custo_total',
            'classificacao',
            'vendedor_revenda',
          ]}
          hasModos
          onImport={(rows, _batchMeta, modo) => importNetSalesApi(rows, modo || 'atual')}
          baseCount={counts.netsales}
          onImported={(r) => handleImported('netsales', r)}
        />

        {/* Card 4: Canais x Clientes (DESATIVADO - Origem via Sincronização com Gestão de Canais de Vendas) */}
        <Card className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-800 text-sm">Canais x Clientes</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 font-bold"
                  >
                    Importação Desativada
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Base Única de Canais e vínculo com revendas
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-200/60 text-slate-500">
                <Database className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-xs leading-relaxed space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                Origem migrada para Gestão de Canais de Vendas
              </p>
              <p className="text-[11px] text-amber-800">
                A importação por planilha foi desativada porque a aplicação{' '}
                <strong>Gestão de Canais de Vendas</strong> é agora a fonte da verdade de revendas e
                contatos. Os dados existentes foram preservados e são atualizados via sincronização
                automática no módulo <strong>Canais</strong>.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 mt-4">
            <span className="flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              Registros preservados na base:
            </span>
            <strong className="text-slate-800 font-bold tabular-nums">
              {formatNumber(counts.canais_clientes ?? 0)}
            </strong>
          </div>
        </Card>

        {/* Card 5: Pedidos em Aberto (SAP) */}
        <BaseImportCard
          title="Pedidos em Aberto (SAP)"
          subtitle="Carteira de pedidos e itens pendentes de faturamento (substituição completa da base)"
          badgeLabel="Substituição Total"
          badgeColor="bg-amber-600"
          lastImportDate={ultimaCargaPedidosAbertos}
          confirmDialog={{
            title: 'Substituir base de Pedidos em Aberto?',
            description:
              'A importação de Pedidos em Aberto apaga todos os registros atualmente cadastrados na base antes de inserir o novo extrato do SAP.\n\nEssa ação garante que pedidos já faturados ou cancelados no SAP não continuem inflando a carteira e os KPIs do painel.',
            confirmLabel: 'Sim, substituir base',
            cancelLabel: 'Cancelar',
          }}
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Ferramentas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Depto de TI</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-medium text-slate-700">
                    Pedidos de Venda em aberto - Revenda
                  </span>
                </li>
                <li className="flex items-center gap-1">
                  <span>Botão direito no # da tabela</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Copiar Tabela</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>Colar no Excel</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>
                    Salve em um local e realize a importação do arquivo: Pedidos em Aberto (SAP)
                  </span>
                </li>
              </ol>
              <div className="pt-1 border-t border-slate-200/60 font-mono text-[9px] text-slate-500 break-words leading-tight select-all">
                SAP &gt; Ferramentas &gt; Consultas &gt; Gerenciador de Consultas &gt; Depto de TI
                &gt; Pedidos de Venda em aberto - Revenda &gt; Botão direito no # da tabela &gt;
                Copiar Tabela &gt; Colar no Excel &gt; Salve em um local e realize a importação do
                arquivo: Pedidos em Aberto (SAP)
              </div>
            </div>
          }
          expectedColumns={[
            'Nº Pedido',
            'Data do Pedido',
            'Código Cliente',
            'Nome Cliente',
            'Código Vendedor',
            'Nome Vendedor',
            'Usuário Emitente',
            'Linha',
            'Código Item',
            'Descrição Item',
            'Grupo do Item',
            'Qtd Solicitada',
            'Status da Linha',
            'Qtd Aberto',
            'Em Estoque',
            'Em Trânsito',
            'Depósito',
            'Preço Unitário',
            '% Desconto',
            'Preço após desconto',
            'Status',
          ]}
          onImport={(rows, batchMeta) =>
            importPedidosAbertosApi(rows, {
              clearBefore: !batchMeta?.isSubsequentBatch,
              replace: true,
              batchIndex: batchMeta?.batchIndex ?? 0,
              isSubsequentBatch: batchMeta?.isSubsequentBatch ?? false,
            })
          }
          baseCount={counts.pedidos_abertos ?? 0}
          onImported={(r) => handleImported('pedidos_abertos', r)}
        />

        {/* Card 6: Posição de Estoque / Estoque Real (SAP) */}
        <BaseImportCard
          title="Posição de Estoque (SAP) — Estoque Real"
          subtitle="Saldo físico atual, em trânsito e pedidos por item (substituição completa da base)"
          badgeLabel="Substituição Total"
          badgeColor="bg-emerald-600"
          lastImportDate={ultimaCargaEstoqueSap}
          confirmDialog={{
            title: 'Substituir base de Posição de Estoque (SAP)?',
            description:
              'A importação de Posição de Estoque (Estoque Real) apaga todos os registros atualmente cadastrados na base antes de inserir a nova posição do SAP.\n\nEssa ação garante que itens que deixaram de ter saldo ou foram descontinuados não permaneçam no cálculo de reposição do MRP.',
            confirmLabel: 'Sim, substituir base',
            cancelLabel: 'Cancelar',
          }}
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Ferramentas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Comercial</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-bold text-emerald-700">Estoque Real</span>
                </li>
                <li className="flex items-center gap-1">
                  <span>Botão direito no # da tabela</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Copiar Tabela</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Colar no Excel</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>
                    Salve em um local e realize a importação do arquivo:{' '}
                    <strong className="text-slate-700">Estoque Real (SAP)</strong>
                  </span>
                </li>
              </ol>
              <div className="pt-1 border-t border-slate-200/60 font-mono text-[9px] text-slate-500 break-words leading-tight select-all">
                SAP &gt; Ferramentas &gt; Consultas &gt; Gerenciador de Consultas &gt; Comercial
                &gt; Estoque Real
                <br />
                Botão direito no # da tabela &gt; Copiar Tabela &gt; Colar no Excel &gt; Salve em um
                local e realize a importação do arquivo: Estoque Real (SAP)
              </div>
            </div>
          }
          expectedColumns={[
            'Código do Item',
            'Descrição Português',
            'Descrição Inglês',
            'Código do Grupo',
            'Nome do Grupo',
            'Código do Subgrupo',
            'Nome do Subgrupo',
            'Item Code',
            'Depósito',
            'Em Estoque',
            'Em Trânsito',
            'Pedido Venda',
            'Estoque Líquido',
            'Custo do Item',
            'Última Venda',
          ]}
          onImport={(rows, batchMeta) =>
            importEstoqueSapApi(rows, {
              clearBefore: !batchMeta?.isSubsequentBatch,
              replace: true,
              batchIndex: batchMeta?.batchIndex ?? 0,
              totalBatches: batchMeta?.totalBatches ?? 1,
              isSubsequentBatch: batchMeta?.isSubsequentBatch ?? false,
            })
          }
          baseCount={counts.estoque_sap ?? 0}
          onImported={(r) => handleImported('estoque_sap', r)}
        />

        {/* Card 7: Tipo de Cliente (SAP) */}
        <BaseImportCard
          title="Tipo de Cliente (SAP)"
          subtitle="Classificação cadastral do parceiro de negócio (substituição completa da base)"
          badgeLabel="Substituição Total"
          badgeColor="bg-purple-600"
          lastImportDate={ultimaCargaTiposCliente}
          confirmDialog={{
            title: 'Substituir base de Tipo de Cliente (SAP)?',
            description:
              'A importação de Tipo de Cliente apaga todos os registros atualmente cadastrados na base antes de inserir o novo extrato do SAP.\n\nEssa ação garante que novos clientes ou alterações de classificação (Atas, Revendas, Cliente Final) reflitam fielmente no painel.',
            confirmLabel: 'Sim, substituir base',
            cancelLabel: 'Cancelar',
          }}
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Depto de TI</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-bold text-purple-700">Tipos de cliente</span>
                </li>
                <li className="flex items-center gap-1">
                  <span>Botão direito na #</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Copiar Tabela</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Colar e Salvar em um Excel</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span>
                    <strong className="text-slate-700">Importar Planilha</strong>
                  </span>
                </li>
              </ol>
              <div className="pt-1 border-t border-slate-200/60 font-mono text-[9px] text-slate-500 break-words leading-tight select-all">
                SAP &gt; Consultas &gt; Gerenciador de Consultas &gt; Depto de TI &gt; Tipos de
                cliente &gt; Botão direito na # &gt; Copiar Tabela &gt; Colar e Salvar em um Excel
                &gt; Importar Planilha
              </div>
            </div>
          }
          expectedColumns={[
            'Código do PN',
            'Nome do PN',
            'Status do cadastro',
            'Tipo de PN',
            'Tipo de Cliente',
          ]}
          onImport={(rows, batchMeta) =>
            importTiposClienteApi(rows, {
              batchIndex: batchMeta?.batchIndex ?? 0,
              totalBatches: batchMeta?.totalBatches ?? 1,
              isSubsequentBatch: batchMeta?.isSubsequentBatch ?? false,
            })
          }
          baseCount={counts.tipos_cliente ?? 0}
          onImported={(r) => handleImported('tipos_cliente', r)}
        />
      </div>

      {/* Resumo final por base — cada base mantém seu próprio resultado */}
      {hasAnyImportResult && (
        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              Resumo das Importações
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Resultado da última carga de cada base, armazenado independentemente.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {summaryEntries.map(({ base, label, color }) => {
                const r = importResults[base]
                const totalNaBase =
                  base === 'produtos'
                    ? counts.produtos
                    : base === 'racnew'
                      ? counts.racnew
                      : base === 'netsales'
                        ? counts.netsales
                        : base === 'canais_clientes'
                          ? (counts.canais_clientes ?? 0)
                          : base === 'pedidos_abertos'
                            ? (counts.pedidos_abertos ?? 0)
                            : base === 'estoque_sap'
                              ? (counts.estoque_sap ?? 0)
                              : (counts.tipos_cliente ?? 0)
                return (
                  <div
                    key={base}
                    className={cn(
                      'p-3 rounded-xl border space-y-2',
                      r
                        ? 'border-slate-200 bg-slate-50/60'
                        : 'border-dashed border-slate-200 bg-white',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('text-sm font-bold', color)}>{label}</span>
                      {!r && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Sem importação
                        </span>
                      )}
                    </div>
                    {r ? (
                      <>
                        <div
                          className={cn(
                            'grid gap-1.5 text-center',
                            (r.mesclados ?? 0) > 0 ? 'grid-cols-4' : 'grid-cols-3',
                          )}
                        >
                          <div className="bg-white p-1.5 rounded-md border border-slate-100">
                            <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                              Novos
                            </span>
                            <span className="text-xs font-bold text-emerald-600">
                              {r.importados}
                            </span>
                          </div>
                          <div className="bg-white p-1.5 rounded-md border border-slate-100">
                            <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                              Atualizados
                            </span>
                            <span className="text-xs font-bold text-indigo-600">
                              {r.atualizados}
                            </span>
                          </div>
                          {(r.mesclados ?? 0) > 0 && (
                            <div className="bg-amber-50/70 p-1.5 rounded-md border border-amber-200">
                              <span className="text-[9px] text-amber-700 uppercase font-semibold block">
                                Mesclados
                              </span>
                              <span className="text-xs font-bold text-amber-800">
                                {r.mesclados}
                              </span>
                            </div>
                          )}
                          <div className="bg-white p-1.5 rounded-md border border-slate-100">
                            <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                              Ignorados
                            </span>
                            <span className="text-xs font-bold text-cyan-600">{r.ignorados}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            Total na base
                          </span>
                          <span className="font-bold text-slate-800 tabular-nums">
                            {formatNumber(totalNaBase)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          Total na base
                        </span>
                        <span className="font-bold text-slate-600 tabular-nums">
                          {formatNumber(totalNaBase)}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info notice about Join Rules */}
      <Alert className="bg-slate-50 border-slate-200">
        <Info className="h-4 w-4 text-indigo-600" />
        <AlertTitle className="text-xs font-semibold text-slate-800">
          Como funciona a junção e enriquecimento?
        </AlertTitle>
        <AlertDescription className="text-xs text-slate-600 leading-relaxed mt-1">
          Ao importar ou consolidar, a rotina lê todos os registros da <strong>RacNew</strong> (base
          mestre). Para cada linha, busca o correspondente na <strong>NetSales</strong> utilizando a
          chave composta quíntupla (Número SAP, Nº NFe, Data, Código do Cliente e Código do Item).
          Da NetSales são adicionados exclusivamente os 12 campos complementares (sem duplicar dados
          compartilhados). O <em>Grupo do Item</em> é vinculado automaticamente pelo código do item
          na base de <strong>Produtos</strong>.
        </AlertDescription>
      </Alert>
    </div>
  )
}
