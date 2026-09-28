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
  getCountsSummary,
} from '@/services/sales'
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

type BaseKey = 'produtos' | 'racnew' | 'netsales' | 'canais_clientes'

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">{title}</CardTitle>
              <CardDescription className="text-xs text-slate-500">{subtitle}</CardDescription>
            </div>
          </div>
          <Badge className={cn('text-[11px] font-semibold text-white', badgeColor)}>
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
    ultimaCarga: null as string | null,
  })
  const [consolidating, setConsolidating] = useState(false)
  const [consolidationResult, setConsolidationResult] = useState<ConsolidarResult | null>(null)
  // Resultado de cada importação armazenado separadamente por base, de forma
  // que RacNew e NetSales (e Produtos) nunca se sobrescrevam.
  const [importResults, setImportResults] = useState<{
    produtos?: ImportResult
    racnew?: ImportResult
    netsales?: ImportResult
    canais_clientes?: ImportResult
  }>({})
  const { toast } = useToast()

  const refreshCounts = async () => {
    try {
      const data = await getCountsSummary()
      setCounts(data)
    } catch (err) {
      console.error('Erro ao buscar contagens:', err)
    }
  }

  useEffect(() => {
    refreshCounts()
  }, [])

  const handleConsolidar = async () => {
    setConsolidating(true)
    try {
      const res = await consolidarVendasApi()
      setConsolidationResult(res)
      await refreshCounts()

      toast({
        title: 'Consolidação finalizada com sucesso!',
        description: `${res.total_consolidado} vendas consolidadas na base mestre.`,
      })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Falha na consolidação'
      toast({
        variant: 'destructive',
        title: 'Erro na consolidação',
        description: errorMsg,
      })
    } finally {
      setConsolidating(false)
    }
  }

  // Callback disparado ao final de cada importação: armazena o resultado
  // desta base específica e atualiza o "Total na base" consultando o backend.
  const handleImported = (base: BaseKey, result: ImportResult) => {
    setImportResults((prev) => ({ ...prev, [base]: result }))
    refreshCounts()
  }

  const summaryEntries: { base: BaseKey; label: string; color: string }[] = [
    { base: 'produtos', label: 'Produtos', color: 'text-cyan-700' },
    { base: 'racnew', label: 'RacNew', color: 'text-indigo-700' },
    { base: 'netsales', label: 'NetSales', color: 'text-teal-700' },
    { base: 'canais_clientes', label: 'Canais x Clientes', color: 'text-sky-700' },
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
                disabled={consolidating}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-6 rounded-xl shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
              >
                {consolidating ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    Consolidando bases...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    Consolidar Vendas Agora
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Counts metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/80">
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

      {/* 4 Import Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        {/* Card 4: Canais x Clientes (Marketing) - Base Única de Canais */}
        <BaseImportCard
          title="Canais x Clientes"
          subtitle="Base Única de Canais e vínculo com revendas"
          badgeLabel="Canais"
          badgeColor="bg-[#0B6E99]"
          expectedColumns={[
            'Status',
            'Série',
            'CANAIS',
            'CANAL_FATURAMENTO',
            'SEGMENTO',
            'INSIDE',
            'COD',
            'CANAL',
            'REVENDA',
            'NOME DO CONTATO',
            'CARGO',
            'E-MAIL',
            'TELEFONE',
          ]}
          onImport={(rows) => importCanaisClientesApi(rows)}
          baseCount={counts.canais_clientes ?? 0}
          onImported={(r) => handleImported('canais_clientes', r)}
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
                        : (counts.canais_clientes ?? 0)
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
