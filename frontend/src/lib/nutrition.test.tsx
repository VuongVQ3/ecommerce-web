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
  it('names each row without its unit; the unit goes with the value', () => {
    render(<NutritionTable nutrition={{ calories: 718, protein: 7.9, fat: 76, carbs: 13.8, fiber: 9.6 }} />)

    const rows = screen.getAllByRole('row').map((r) => [r.querySelector('th')!.textContent, r.querySelector('td')!.textContent])
    expect(rows).toEqual([
      ['Năng lượng (Energy)', '718 kcal'],
      ['Chất đạm (Protein)', '7.9 g'],
      ['Chất béo (Fat)', '76 g'],
      ['Chất bột đường (Carb)', '13.8 g'],
      ['Chất xơ (Fiber)', '9.6 g'],
    ])
  })
})
