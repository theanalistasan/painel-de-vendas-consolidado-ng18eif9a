import React, { useState, useEffect, useRef } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  Database,
  Layers,
  ArrowRight,
  Info,
  X,
  FileText,
} from 'lucide-react'
import {
  importProdutosApi,
  importRacNewApi,
  importNetSalesApi,
  importCanaisClientesApi,
  consolidarVendasApi,
  reconstruirResumosApi,
  getCountsSummary,
} from '@/services/sales'
import { importPedidosAbertosApi, fetchUltimaCargaPedidosAbertos } from '@/services/pedidosAbertos'
import { importEstoqueSapApi } from '@/services/estoqueFaltante'
import { logAudit } from '@/services/audit'
import { parseCSV, parseXLSX, formatNumber, formatDateTime } from '@/lib/formatters'
import type { ImportResult, ConsolidarResult } from '@/types/sales'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

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

interface CardImportProps {
  title: string
  subtitle: string
  expectedColumns: string[]
  onImport: (rows: Record<string, unknown>[]) => Promise<ImportResult>
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
}: CardImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
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
          const res = await onImport(chunks[i])
          acc.importados += res.importados || 0
          acc.atualizados += res.atualizados || 0
          acc.mesclados = (acc.mesclados || 0) + (res.mesclados || 0)
          acc.ignorados += res.ignorados || 0
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

            {/* Action button */}
            <Button
              onClick={handleExecuteImport}
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
  const [counts, setCounts] = useState({
    produtos: 0,
    racnew: 0,
    netsales: 0,
    vendas: 0,
    canais_clientes: 0,
    pedidos_abertos: 0,
    estoque_sap: 0,
    ultimaCarga: null as string | null,
    ultimaCargaPedidosAbertos: null as string | null,
  })
  const [ultimaCargaPedidosAbertos, setUltimaCargaPedidosAbertos] = useState<string | null>(null)
  const [consolidating, setConsolidating] = useState(false)
  const [rebuildingSummaries, setRebuildingSummaries] = useState(false)
  const [consolidationResult, setConsolidationResult] = useState<ConsolidarResult | null>(null)
  const [consolidationError, setConsolidationError] = useState<string | null>(null)
  // Resultado de cada importação armazenado separadamente por base
  const [importResults, setImportResults] = useState<{
    produtos?: ImportResult
    racnew?: ImportResult
    netsales?: ImportResult
    canais_clientes?: ImportResult
    pedidos_abertos?: ImportResult
    estoque_sap?: ImportResult
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
    } catch (err) {
      console.error('Erro ao buscar contagens:', err)
      const directDate = await fetchUltimaCargaPedidosAbertos()
      setUltimaCargaPedidosAbertos(directDate)
    }
  }

  useEffect(() => {
    refreshCounts()
    // Registrar acesso à tela de importação no audit_logs
    logAudit('import_access', 'Acesso à tela de Importação e Consolidação de Bases')
  }, [])

  const handleConsolidar = async () => {
    setConsolidating(true)
    setConsolidationError(null)
    try {
      // Etapa 1: Carga em massa na tabela vendas
      const res = await consolidarVendasApi()
      setConsolidationResult(res)
      await refreshCounts()

      toast({
        title: 'Carga de Vendas Concluída!',
        description: `${res.total_consolidado} vendas consolidadas. Reconstruindo resumos analíticos...`,
      })

      // Etapa 2: Reconstrução dos 3 resumos pré-calculados
      setRebuildingSummaries(true)
      try {
        const resumoRes = await reconstruirResumosApi()
        toast({
          title: 'Consolidação e Resumos Finalizados!',
          description: `${res.total_consolidado} vendas consolidadas e resumos mensais atualizados (${resumoRes.durationMs}ms).`,
        })
      } catch (resumoErr: unknown) {
        const resumoMsg =
          (resumoErr as { response?: { error?: string } })?.response?.error ||
          (resumoErr as Error)?.message ||
          'Falha na reconstrução de resumos'
        console.error('Erro na etapa de reconstrução de resumos:', resumoErr)
        setConsolidationError(
          `Carga concluída (${res.total_consolidado} registros), porém a reconstrução de resumos falhou: ${resumoMsg}`,
        )
        toast({
          variant: 'destructive',
          title: 'Aviso: Resumos Pendentes',
          description: `Vendas gravadas com sucesso, mas resumos falharam: ${resumoMsg}`,
        })
      } finally {
        setRebuildingSummaries(false)
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { error?: string } })?.response?.error ||
        (err as Error)?.message ||
        'Falha na consolidação de vendas'
      console.error('Erro na consolidação:', err)
      setConsolidationError(errorMsg)
      toast({
        variant: 'destructive',
        title: 'Erro na consolidação',
        description: errorMsg,
      })
    } finally {
      setConsolidating(false)
    }
  }

  const handleReconstruirResumosApenas = async () => {
    setRebuildingSummaries(true)
    setConsolidationError(null)
    try {
      const resumoRes = await reconstruirResumosApi()
      toast({
        title: 'Resumos Reconstruídos!',
        description: `Tabelas analíticas de resumo atualizadas com sucesso (${resumoRes.durationMs}ms).`,
      })
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { error?: string } })?.response?.error ||
        (err as Error)?.message ||
        'Falha na reconstrução de resumos'
      setConsolidationError(errorMsg)
      toast({
        variant: 'destructive',
        title: 'Erro na reconstrução de resumos',
        description: errorMsg,
      })
    } finally {
      setRebuildingSummaries(false)
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
      logAudit(
        'estoque_sap_import',
        `Posição de Estoque (SAP): ${result.importados ?? 0} novos, ${result.atualizados ?? 0} atualizados, ${result.mesclados ?? 0} mesclados, ${result.ignorados ?? 0} ignorados`,
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
                    Consolidando Vendas...
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

          {/* Mensagem de Erro Real do Backend */}
          {consolidationError && (
            <div className="mt-4 p-4 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs sm:text-sm flex items-start gap-3">
              <span className="font-bold text-red-400 shrink-0 uppercase tracking-wide text-[11px] bg-red-900/80 px-2 py-0.5 rounded border border-red-700">
                Erro Backend
              </span>
              <p className="flex-1 font-mono text-xs break-all leading-relaxed">
                {consolidationError}
              </p>
            </div>
          )}

          {/* Counts metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mt-6 pt-6 border-t border-slate-800/80">
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
          onImport={(rows) => importRacNewApi(rows)}
          baseCount={counts.racnew}
          onImported={(r) => handleImported('racnew', r)}
        />

        {/* Card 3: NetSales */}
        <BaseImportCard
          title="NetSales"
          subtitle="Campos comerciais e custos complementares"
          badgeLabel="NetSales"
          badgeColor="bg-teal-600"
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
          onImport={(rows) => importNetSalesApi(rows)}
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
          subtitle="Carteira de pedidos e itens pendentes de faturamento"
          badgeLabel="Pedidos SAP"
          badgeColor="bg-amber-600"
          lastImportDate={ultimaCargaPedidosAbertos}
          customGuide={
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Caminho do relatório no SAP:</span>
              </div>
              <ol className="text-[10px] leading-relaxed text-slate-600 space-y-0.5 list-none">
                <li className="flex items-center gap-1">
                  <span className="font-semibold text-slate-700">SAP</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Ferramentas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Consultas</span>
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-semibold text-slate-700">Gerenciador de Consultas</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
                  <span className="font-medium text-slate-700">Pedidos de Venda em aberto</span>
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-slate-400 font-mono text-[9px]">&gt;</span>
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
                SAP &gt; Ferramentas &gt; Consultas &gt; Gerenciador de Consultas &gt; Pedidos de
                Venda em aberto &gt; Botão direito no # da tabela &gt; Copiar Tabela &gt; Colar no
                Excel &gt; Salve em um local e realize a importação do arquivo: Pedidos em Aberto
                (SAP)
              </div>
            </div>
          }
          expectedColumns={[
            'Nº Pedido',
            'Data do Pedido',
            'Código Cliente',
            'Nome Cliente',
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
          onImport={(rows) => importPedidosAbertosApi(rows)}
          baseCount={counts.pedidos_abertos ?? 0}
          onImported={(r) => handleImported('pedidos_abertos', r)}
        />

        {/* Card 6: Posição de Estoque (SAP) */}
        <BaseImportCard
          title="Posição de Estoque (SAP)"
          subtitle="Saldo físico atual e em trânsito por item (chave única: Código do Item)"
          badgeLabel="Estoque SAP"
          badgeColor="bg-emerald-600"
          expectedColumns={[
            'Código do Item',
            'Quantidade em Estoque',
            'Em Trânsito',
            'Descrição do Item (opcional)',
            'Grupo do Item (opcional)',
          ]}
          onImport={(rows) => importEstoqueSapApi(rows)}
          baseCount={counts.estoque_sap ?? 0}
          onImported={(r) => handleImported('estoque_sap', r)}
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
                            : (counts.estoque_sap ?? 0)
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
