import { describe, it, expect } from 'vitest'
import {
  getJpClass,
  getJpClassGroup,
  getStandardJpClass,
  matchesJpClassFilter,
  getJpClassBadgeStyle,
  JP_CLASS_OPTIONS,
} from '@/lib/jp-class'

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
})
