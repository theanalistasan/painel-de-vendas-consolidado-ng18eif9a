import { describe, it, expect, beforeEach } from 'vitest'
import {
  getJpClass,
  getJpClassGroup,
  getStandardJpClass,
  matchesJpClassFilter,
  getJpClassBadgeStyle,
  JP_CLASS_OPTIONS,
  DEFAULT_GRUPOS_ITEM_JP_CLASS,
  resolveDefaultGrupoItemSelection,
  isLegacySinglePecasSelection,
} from '@/lib/jp-class'
import {
  loadFiltersFromSession,
  saveFiltersToSession,
  clearFiltersFromSession,
  DEFAULT_GRUPOS_ITEM,
} from '@/lib/filter-persistence'

describe('Regra de De/Para JP-Class', () => {
  describe('getJpClass', () => {
    it('deve mapear TINTAS (e variações com acento/singular/maiúscula) para INKS', () => {
      expect(getJpClass('TINTAS')).toBe('INKS')
      expect(getJpClass('Tintas')).toBe('INKS')
      expect(getJpClass('Tinta')).toBe('INKS')
      expect(getJpClass('  tintas  ')).toBe('INKS')
      expect(getJpClass('INKS')).toBe('INKS')
    })

    it('deve mapear EQUIPAMENTOS para HARD', () => {
      expect(getJpClass('EQUIPAMENTOS')).toBe('HARD')
      expect(getJpClass('Equipamentos')).toBe('HARD')
      expect(getJpClass('Equipamento')).toBe('HARD')
      expect(getJpClass('HARD')).toBe('HARD')
    })

    it('deve mapear PEÇAS e ACESSÓRIOS para OTHERS', () => {
      expect(getJpClass('PEÇAS')).toBe('OTHERS')
      expect(getJpClass('PECAS')).toBe('OTHERS')
      expect(getJpClass('Peça')).toBe('OTHERS')
      expect(getJpClass('ACESSÓRIOS')).toBe('OTHERS')
      expect(getJpClass('ACESSORIOS')).toBe('OTHERS')
      expect(getJpClass('ASSESSÓRIOS')).toBe('OTHERS')
      expect(getJpClass('OTHERS')).toBe('OTHERS')
    })

    it('deve mapear QUALQUER OUTRO valor de Grupo para OTHERS', () => {
      expect(getJpClass('SERVIÇOS')).toBe('OTHERS')
      expect(getJpClass('BRINDES')).toBe('OTHERS')
      expect(getJpClass('MATERIAIS')).toBe('OTHERS')
      expect(getJpClass('DIVERSOS')).toBe('OTHERS')
      expect(getJpClass('SOFTWARE')).toBe('OTHERS')
    })

    it('deve aceitar objetos contendo grupo_item, grupo ou itms_grp_nam e ignorar jp_class pré-calculado antigo', () => {
      expect(getJpClass({ grupo_item: 'TINTAS', jp_class: 'HARD' })).toBe('INKS')
      expect(getJpClass({ grupo_item: 'EQUIPAMENTOS', jp_class: 'INKS' })).toBe('HARD')
      expect(getJpClass({ itms_grp_nam: 'TINTAS' })).toBe('INKS')
      expect(getJpClass({ grupo: 'PEÇAS' })).toBe('OTHERS')
      expect(getJpClass({ grupo_item: 'DIVERSOS', jp_class: 'HARD' })).toBe('OTHERS')
      expect(getJpClass({ grupo_item: '', jp_class: 'HARD' })).toBe('Sem classe')
    })

    it('deve retornar "Sem classe" apenas para valores vazios ou ausentes', () => {
      expect(getJpClass(null)).toBe('Sem classe')
      expect(getJpClass(undefined)).toBe('Sem classe')
      expect(getJpClass('')).toBe('Sem classe')
      expect(getJpClass('   ')).toBe('Sem classe')
      expect(getJpClass('Sem classe')).toBe('Sem classe')
    })
  })

  describe('getStandardJpClass & getJpClassGroup', () => {
    it('deve classificar conforme opções padronizadas', () => {
      expect(getStandardJpClass('TINTAS')).toBe('INKS')
      expect(getStandardJpClass('EQUIPAMENTOS')).toBe('HARD')
      expect(getStandardJpClass('PEÇAS')).toBe('OTHERS')
      expect(getStandardJpClass('SERVIÇOS')).toBe('OTHERS')
      expect(getStandardJpClass('')).toBe('Sem classe')
      expect(getStandardJpClass(undefined)).toBe('Sem classe')

      expect(getJpClassGroup('TINTAS')).toBe('INKS')
      expect(getJpClassGroup('QUALQUER')).toBe('OTHERS')
      expect(getJpClassGroup('')).toBe('Sem classe')
    })
  })

  describe('matchesJpClassFilter', () => {
    it('deve filtrar corretamente por JP-Class (chamada direta e legada)', () => {
      // Sem filtro selecionado -> true
      expect(matchesJpClassFilter('HARD', [])).toBe(true)
      expect(matchesJpClassFilter('HARD', undefined, [])).toBe(true)
      expect(matchesJpClassFilter(undefined, undefined)).toBe(true)

      // Com filtro INKS sobre Grupo TINTAS (qualquer caixa/espaço)
      expect(matchesJpClassFilter('TINTAS', ['INKS'])).toBe(true)
      expect(matchesJpClassFilter('Tintas', ['INKS'])).toBe(true)
      expect(matchesJpClassFilter(' TINTAS ', ['INKS'])).toBe(true)
      expect(matchesJpClassFilter('TINTAS', ['OTHERS'])).toBe(false)

      // Com filtro OTHERS
      expect(matchesJpClassFilter('SERVIÇOS', ['OTHERS'])).toBe(true)
      expect(matchesJpClassFilter('PEÇAS', ['OTHERS'])).toBe(true)
      expect(matchesJpClassFilter('ACESSÓRIOS', ['OTHERS'])).toBe(true)
      expect(matchesJpClassFilter(undefined, 'SERVIÇOS', ['OTHERS'])).toBe(true)
      expect(matchesJpClassFilter(undefined, 'PEÇAS', ['OTHERS'])).toBe(true)
      expect(matchesJpClassFilter(undefined, 'TINTAS', ['OTHERS'])).toBe(false)

      // Com filtro HARD
      expect(matchesJpClassFilter('EQUIPAMENTOS', ['HARD'])).toBe(true)
      expect(matchesJpClassFilter('Equipamentos', ['HARD'])).toBe(true)

      // Com filtro Sem classe
      expect(matchesJpClassFilter('', ['Sem classe'])).toBe(true)
      expect(matchesJpClassFilter(null, ['Sem classe'])).toBe(true)
      expect(matchesJpClassFilter(undefined, '', ['Sem classe'])).toBe(true)
      expect(matchesJpClassFilter(undefined, null, ['Sem classe'])).toBe(true)
      expect(matchesJpClassFilter(undefined, 'TINTAS', ['Sem classe'])).toBe(false)
      expect(matchesJpClassFilter(undefined, 'SERVIÇOS', ['Sem classe'])).toBe(false)
    })
  })

  describe('getJpClassBadgeStyle', () => {
    it('deve retornar estilos corretos para cada classe de JP_CLASS_OPTIONS', () => {
      expect(getJpClassBadgeStyle('INKS').className).toContain('text-sky-700')
      expect(getJpClassBadgeStyle('HARD').className).toContain('text-amber-800')
      expect(getJpClassBadgeStyle('OTHERS').className).toContain('text-emerald-800')
      expect(getJpClassBadgeStyle('Sem classe').className).toContain('text-slate-500')
      expect(getJpClassBadgeStyle('').className).toContain('text-slate-500')
      expect(getJpClassBadgeStyle(null).className).toContain('text-slate-500')
    })
  })

  describe('JP_CLASS_OPTIONS', () => {
    it('deve conter as 4 opções padronizadas', () => {
      expect(JP_CLASS_OPTIONS).toEqual(['HARD', 'INKS', 'OTHERS', 'Sem classe'])
    })
  })

  describe('Padrão inicial do filtro Grupo do Item no JP-Class', () => {
    it('deve exportar os 4 grupos canônicos: Equipamentos, Peças, Tintas e Acessórios', () => {
      expect(DEFAULT_GRUPOS_ITEM_JP_CLASS).toEqual([
        'EQUIPAMENTOS',
        'PEÇAS',
        'TINTAS',
        'ACESSÓRIOS',
      ])
    })

    it('resolveDefaultGrupoItemSelection deve casar variações com e sem acento da base', () => {
      const opcoesBase = [
        'EQUIPAMENTOS',
        'ACESSORIOS',
        'ACESSÓRIOS',
        'TINTAS',
        'PECAS',
        'PEÇAS',
        'SERVIÇOS',
        'BRINDES',
      ]
      const resolved = resolveDefaultGrupoItemSelection(opcoesBase)
      expect(resolved).toContain('EQUIPAMENTOS')
      expect(resolved).toContain('ACESSORIOS')
      expect(resolved).toContain('ACESSÓRIOS')
      expect(resolved).toContain('TINTAS')
      expect(resolved).toContain('PECAS')
      expect(resolved).toContain('PEÇAS')
      expect(resolved).not.toContain('SERVIÇOS')
      expect(resolved).not.toContain('BRINDES')
    })

    it('resolveDefaultGrupoItemSelection deve retornar fallback canônico quando lista for vazia', () => {
      expect(resolveDefaultGrupoItemSelection([])).toEqual(DEFAULT_GRUPOS_ITEM_JP_CLASS)
    })

    it('isLegacySinglePecasSelection deve identificar corretamente seleção legada de apenas PEÇAS', () => {
      expect(isLegacySinglePecasSelection(['PEÇAS'])).toBe(true)
      expect(isLegacySinglePecasSelection(['PECAS'])).toBe(true)
      expect(isLegacySinglePecasSelection(['Peças'])).toBe(true)
      expect(isLegacySinglePecasSelection(['Peca'])).toBe(true)
      expect(isLegacySinglePecasSelection(['PEÇAS', 'TINTAS'])).toBe(false)
      expect(isLegacySinglePecasSelection(['TINTAS'])).toBe(false)
      expect(isLegacySinglePecasSelection([])).toBe(false)
      expect(isLegacySinglePecasSelection(null)).toBe(false)
      expect(isLegacySinglePecasSelection(undefined)).toBe(false)
    })
  })

  describe('Correção de seleção legada em sessão (filter-persistence)', () => {
    beforeEach(() => {
      clearFiltersFromSession()
    })

    it('quando sessão tem apenas PEÇAS, loadFiltersFromSession deve promover para os 4 grupos padrão', () => {
      // Simula sessão legada salva antes do 0.0.234
      saveFiltersToSession({
        base: 'ambos',
        dataDe: '',
        dataAte: '',
        vendedorCliente: [],
        vendedor: [],
        grupoItem: ['PEÇAS'],
        estado: [],
        utilizacao: ['VENDA DE MERCADORIA'],
        tipoDocumento: ['NF de Saída'],
        canal: [],
        canalClientes: [],
        deploy: [],
        inside: [],
        tipoCliente: [],
        jpClass: [],
        search: '',
        ano: ['2026'],
        mes: ['9'],
        dia: [],
        tipoDevolucao: '',
      })

      const loaded = loadFiltersFromSession()
      expect(loaded.grupoItem).toEqual(DEFAULT_GRUPOS_ITEM)
      expect(loaded.grupoItem).toContain('EQUIPAMENTOS')
      expect(loaded.grupoItem).toContain('ACESSÓRIOS')
      expect(loaded.grupoItem).toContain('TINTAS')
      expect(loaded.grupoItem).toContain('PEÇAS')
    })

    it('quando sessão tem escolha explícita legítima (ex: apenas TINTAS), deve ser respeitada', () => {
      saveFiltersToSession({
        base: 'ambos',
        dataDe: '',
        dataAte: '',
        vendedorCliente: [],
        vendedor: [],
        grupoItem: ['TINTAS'],
        estado: [],
        utilizacao: [],
        tipoDocumento: [],
        canal: [],
        canalClientes: [],
        deploy: [],
        inside: [],
        tipoCliente: [],
        jpClass: [],
        search: '',
        ano: [],
        mes: [],
        dia: [],
        tipoDevolucao: '',
      })

      const loaded = loadFiltersFromSession()
      expect(loaded.grupoItem).toEqual(['TINTAS'])
    })
  })
})
