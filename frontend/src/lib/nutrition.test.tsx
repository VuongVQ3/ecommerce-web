// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NutritionTable } from '../components/ProductInfo'
import { nutrientFieldLabel, nutrientLabel, NUTRIENTS } from './nutrition'

afterEach(cleanup)

describe('nutrient labels', () => {
  it('are Vietnamese first with the English name in brackets, in table order', () => {
    expect(NUTRIENTS.map((n) => nutrientLabel(n.key))).toEqual([
      'Năng lượng (Energy)',
      'Chất đạm (Protein)',
      'Chất béo (Fat)',
      'Chất bột đường (Carb)',
      'Chất xơ (Fiber)',
    ])
  })

  it('carry the unit in the admin form', () => {
    expect(NUTRIENTS.map((n) => nutrientFieldLabel(n.key))).toEqual([
      'Năng lượng – Energy (kcal)',
      'Chất đạm – Protein (g)',
      'Chất béo – Fat (g)',
      'Chất bột đường – Carb (g)',
      'Chất xơ – Fiber (g)',
    ])
  })
})

describe('NutritionTable', () => {
  it('pairs each name (without its unit) with its figure and unit, name first for screen readers', () => {
    render(<NutritionTable nutrition={{ calories: 718, protein: 7.9, fat: 76, carbs: 13.8, fiber: 9.6 }} />)

    // <dl> has no ARIA role to query by: the section's description list
    const list = screen.getByRole('region', { name: 'Giá trị dinh dưỡng' }).querySelector('dl')!
    const pairs = [...list.children].map((tile) => {
      const [dt, dd] = tile.children
      expect([dt.tagName, dd.tagName]).toEqual(['DT', 'DD'])
      return [dt.textContent, dd.textContent]
    })
    expect(screen.getByText('Trên 100g sản phẩm')).toBeTruthy()
    expect(pairs).toEqual([
      ['Năng lượng (Energy)', '718 kcal'],
      ['Chất đạm (Protein)', '7.9 g'],
      ['Chất béo (Fat)', '76 g'],
      ['Chất bột đường (Carb)', '13.8 g'],
      ['Chất xơ (Fiber)', '9.6 g'],
    ])
  })
})
