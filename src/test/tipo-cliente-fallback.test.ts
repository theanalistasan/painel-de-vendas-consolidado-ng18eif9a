import { describe, it, expect } from 'vitest'
import {
  buildTiposClienteStringMap,
  resolveTipoCliente,
  enrichVendaTipoCliente,
  type TipoClienteInfo,
} from '@/services/tiposCliente'

describe('tiposCliente fallback logic', () => {
  const mockInfoMap: Record<string, TipoClienteInfo> = {
    C0001: {
      codigo_cliente: 'C0001',
      nome_cliente: 'Cliente Alpha',
      tipo_cliente: 'Revenda',
      data_carga: '2025-01-01',
    },
    C0002: {
      codigo_cliente: 'C0002',
      nome_cliente: 'Cliente Beta',
      tipo_cliente: 'Comunicação Visual',
      data_carga: '2025-01-01',
    },
    '  c0003  ': {
      codigo_cliente: 'c0003',
      nome_cliente: 'Cliente Gamma',
      tipo_cliente: '  Gráfica Rápida  ',
      data_carga: '2025-01-01',
    },
  }

  it('buildTiposClienteStringMap converts object correctly and normalizes keys/values', () => {
    const stringMap = buildTiposClienteStringMap(mockInfoMap)
    expect(stringMap['C0001']).toBe('Revenda')
    expect(stringMap['C0002']).toBe('Comunicação Visual')
    expect(stringMap['C0003']).toBe('Gráfica Rápida')
    expect(buildTiposClienteStringMap(null)).toEqual({})
    expect(buildTiposClienteStringMap(undefined)).toEqual({})
  })

  it('resolveTipoCliente preserves already filled tipo_cliente', () => {
    const stringMap = buildTiposClienteStringMap(mockInfoMap)
    const resolved = resolveTipoCliente('Revenda Especial', 'C0001', stringMap)
    expect(resolved).toBe('Revenda Especial')
  })

  it('resolveTipoCliente falls back to stringMap when tipo_cliente is empty or undefined or "-"', () => {
    const stringMap = buildTiposClienteStringMap(mockInfoMap)
    expect(resolveTipoCliente('', 'C0001', stringMap)).toBe('Revenda')
    expect(resolveTipoCliente('   ', 'C0002', stringMap)).toBe('Comunicação Visual')
    expect(resolveTipoCliente(undefined, 'C0001', stringMap)).toBe('Revenda')
    expect(resolveTipoCliente('-', 'C0001', stringMap)).toBe('Revenda')
    expect(resolveTipoCliente(null, 'c0001', stringMap)).toBe('Revenda') // case insensitive match
  })

  it('resolveTipoCliente returns "-" when neither field nor map has value', () => {
    const stringMap = buildTiposClienteStringMap(mockInfoMap)
    expect(resolveTipoCliente('', 'C9999', stringMap)).toBe('-')
    expect(resolveTipoCliente(undefined, undefined, stringMap)).toBe('-')
    expect(resolveTipoCliente(null, null, stringMap)).toBe('-')
    expect(resolveTipoCliente('-', 'C9999', stringMap)).toBe('-')
  })

  it('enrichVendaTipoCliente enriches item with resolved tipo_cliente', () => {
    const stringMap = buildTiposClienteStringMap(mockInfoMap)
    const itemSemTipo = {
      id: 'v1',
      codigo_cliente: 'C0001',
      tipo_cliente: '',
      numero_nfe: '123',
    }
    const enriched = enrichVendaTipoCliente(itemSemTipo, stringMap)
    expect(enriched.tipo_cliente).toBe('Revenda')
    expect(enriched.numero_nfe).toBe('123')

    const itemComTipo = {
      id: 'v2',
      codigo_cliente: 'C0001',
      tipo_cliente: 'Consumidor Final',
      numero_nfe: '456',
    }
    const enriched2 = enrichVendaTipoCliente(itemComTipo, stringMap)
    expect(enriched2.tipo_cliente).toBe('Consumidor Final')

    const itemDesconhecido = {
      id: 'v3',
      codigo_cliente: 'C9999',
      tipo_cliente: '',
      numero_nfe: '789',
    }
    const enriched3 = enrichVendaTipoCliente(itemDesconhecido, stringMap)
    expect(enriched3.tipo_cliente).toBe('-')
  })
})
