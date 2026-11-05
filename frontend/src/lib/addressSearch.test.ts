import { describe, expect, it } from 'vitest'
import data from '../data/vn-admin-units.json'
import type { Province } from './adminUnits'
import { provinceChoices, searchIndex, searchOptions, sortByName, stripAdminPrefix, wardChoices } from './addressSearch'

const provinces = data.provinces as Province[]
const { options, groups } = provinceChoices(provinces)
const index = searchIndex(options)
const labels = (query: string) => searchOptions(index, query).map((m) => m.option.label)
const hcmWards = wardChoices(provinces.find((p) => p.code === 79)!.wards)

describe('addressSearch', () => {
  it('ignores case, accents and đ', () => {
    for (const q of ['ho chi minh', 'hồ chí minh', 'Ho Chi Minh', '  HỒ   chi minh ']) {
      expect(labels(q)).toEqual(['Thành phố Hồ Chí Minh'])
    }
    expect(labels('da nang')[0]).toBe('Thành phố Đà Nẵng')
    expect(labels('dak lak')).toEqual(['Tỉnh Đắk Lắk'])
  })

  it('looks past the administrative prefix, and lets it be typed', () => {
    // "Tỉnh"/"Thành phố" are not what is searched: "tinh" alone is a word inside names only
    expect(labels('an giang')).toEqual(['Tỉnh An Giang'])
    expect(labels('thanh pho hue')).toEqual(['Thành phố Huế'])
    const wards = searchIndex(hcmWards)
    const phuongAn = searchOptions(wards, 'phuong an').map((m) => m.option.label)
    expect(phuongAn[0]).toBe('Phường An Đông')
    expect(phuongAn.every((l) => l.startsWith('Phường'))).toBe(true)
    // The one ward written "xã" in the data
    expect(stripAdminPrefix('xã Bắc Sơn')).toBe('Bắc Sơn')
    expect(stripAdminPrefix('Đặc khu Côn Đảo')).toBe('Côn Đảo')
  })

  it('knows the short names of the big cities', () => {
    for (const q of ['hcm', 'tphcm', 'tp hcm', 'TP HCM', 'sai gon', 'Sài Gòn', 'saigon', 'sg']) {
      expect(labels(q)[0]).toBe('Thành phố Hồ Chí Minh')
    }
    expect(labels('hn')[0]).toBe('Thành phố Hà Nội')
    expect(labels('dn')[0]).toBe('Thành phố Đà Nẵng')
    expect(labels('hp')[0]).toBe('Thành phố Hải Phòng')
    expect(labels('ct')[0]).toBe('Thành phố Cần Thơ')
    // A keyword is not highlighted in the label
    expect(searchOptions(index, 'hcm')[0].ranges).toEqual([])
  })

  it('needs every word, in any order', () => {
    expect(labels('minh ho')).toEqual(['Thành phố Hồ Chí Minh'])
    expect(labels('ninh quang')).toEqual(['Tỉnh Quảng Ninh'])
    expect(labels('ninh xyz')).toEqual([])
  })

  it('ranks starts-with, then a word starting with it, then inside a word', () => {
    // Ninh Bình starts with "ninh"; Bắc Ninh, Quảng Ninh, Tây Ninh have a word starting with it (then A→Z)
    expect(labels('ninh')).toEqual(['Tỉnh Ninh Bình', 'Tỉnh Bắc Ninh', 'Tỉnh Quảng Ninh', 'Tỉnh Tây Ninh'])
    // "ai": Gia Lai (word "lai" contains it) and others only inside a word, after any starts-with
    expect(labels('lai')).toEqual(['Tỉnh Lai Châu', 'Tỉnh Gia Lai'])
    // Inside a word last: "uang" is only inside words (Quảng, Quang)
    const ninhUang = labels('uang ninh')
    expect(ninhUang).toEqual(['Tỉnh Quảng Ninh'])
    // "ha": names starting with it (A→Z), then inside a word ("Khánh Hòa", "Thanh Hóa": in "khanh", "thanh")
    const ha = labels('ha')
    expect(ha.slice(0, 3)).toEqual(['Thành phố Hà Nội', 'Tỉnh Hà Tĩnh', 'Thành phố Hải Phòng'])
    expect(ha.indexOf('Tỉnh Khánh Hòa')).toBeGreaterThan(2)
    // The "Thành phố" in front of Cần Thơ is not searched
    expect(ha).not.toContain('Thành phố Cần Thơ')
  })

  it('highlights the matching parts of the label, accents and all', () => {
    const [hcm] = searchOptions(index, 'ho chi')
    // "Thành phố Hồ Chí Minh": "Hồ" and "Chí", not the "ho" inside "Thành phố"
    expect(hcm.ranges.map(([a, b]) => hcm.option.label.slice(a, b))).toEqual(['Hồ', 'Chí'])
    const [dak] = searchOptions(index, 'lak dak')
    expect(dak.ranges.map(([a, b]) => dak.option.label.slice(a, b))).toEqual(['Đắk', 'Lắk'])
  })

  it('offers the popular provinces first, then all the others A→Z without their prefix', () => {
    expect(groups.map((g) => g.label)).toEqual(['Thường chọn', 'Tất cả'])
    expect(groups[0].options.map((o) => o.label)).toEqual([
      'Thành phố Hồ Chí Minh',
      'Thành phố Hà Nội',
      'Thành phố Đà Nẵng',
    ])
    const rest = groups[1].options.map((o) => o.label)
    expect(rest).toHaveLength(31)
    expect(rest[0]).toBe('Tỉnh An Giang')
    expect(rest).not.toContain('Thành phố Hồ Chí Minh')
    // "Thành phố Cần Thơ" sorts as "Cần Thơ": after Cao Bằng (a before â in the Vietnamese alphabet)
    expect(rest.slice(1, 5)).toEqual(['Tỉnh Bắc Ninh', 'Tỉnh Cà Mau', 'Tỉnh Cao Bằng', 'Thành phố Cần Thơ'])
    // Đ after every D (and Đ words after Cao Bằng, before Gia Lai)
    expect(rest.indexOf('Tỉnh Đắk Lắk')).toBeGreaterThan(rest.indexOf('Tỉnh Cao Bằng'))
    expect(rest.indexOf('Tỉnh Đồng Tháp')).toBeLessThan(rest.indexOf('Tỉnh Gia Lai'))
    expect(options).toHaveLength(34)
  })

  it('sorts Đ after D', () => {
    const sorted = sortByName([{ label: 'Xã Đông Hòa' }, { label: 'Phường Dương Đông' }, { label: 'Xã Di Linh' }])
    expect(sorted.map((o) => o.label)).toEqual(['Xã Di Linh', 'Phường Dương Đông', 'Xã Đông Hòa'])
  })

  it('lists wards A→Z whatever their prefix', () => {
    const names = hcmWards.map((o) => o.label)
    // Côn Đảo (Đặc khu) is among the C names, not first; Phường and Xã are mixed
    expect(names[0]).toBe('Phường An Đông')
    expect(names.indexOf('Đặc khu Côn Đảo')).toBeGreaterThan(names.indexOf('Phường Bình Thạnh'))
    const firstXa = names.findIndex((l) => l.startsWith('Xã'))
    const lastPhuong = names.findLastIndex((l) => l.startsWith('Phường'))
    expect(firstXa).toBeLessThan(lastPhuong)
    const keys = names.map(stripAdminPrefix)
    const collator = new Intl.Collator('vi', { sensitivity: 'base' })
    expect(keys).toEqual([...keys].sort(collator.compare))
  })
})
