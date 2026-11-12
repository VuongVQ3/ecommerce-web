import type { AssetDetail, AssetRow, FolderNode } from './damApi'

/** Test data for the DAM pages (imported by tests only). */
export const TREE: FolderNode[] = [
  {
    id: 1,
    parentId: null,
    name: 'hat-lanh',
    path: '/hat-lanh',
    assetCount: 0,
    children: [
      { id: 2, parentId: 1, name: 'banners', path: '/hat-lanh/banners', assetCount: 2, children: [] },
      { id: 3, parentId: 1, name: 'tai-lieu', path: '/hat-lanh/tai-lieu', assetCount: 1, children: [] },
    ],
  },
]

export function assetRow(over: Partial<AssetRow> = {}): AssetRow {
  return {
    id: 'a1',
    folderId: 2,
    fileName: 'banner-tet.jpg',
    kind: 'IMAGE',
    mime: 'image/jpeg',
    sizeBytes: 2048,
    width: 1200,
    height: 800,
    pageCount: null,
    url: 'https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/dam/a1.jpg',
    title: 'Banner Tết',
    alt: 'Giỏ quà Tết',
    tags: ['tet'],
    updatedAt: '2026-11-12T03:00:00Z',
    updatedByName: 'Nhân Viên',
    renditions: { thumb: 'https://res.cloudinary.com/thumb.jpg', card: 'https://res.cloudinary.com/card.jpg' },
    stableUrl: '/files/a1/banner-tet.jpg',
    ...over,
  }
}

export function assetDetail(over: Partial<AssetDetail> = {}): AssetDetail {
  return {
    ...assetRow(),
    folderPath: '/hat-lanh/banners',
    storageVersion: 1,
    description: null,
    checksum: 'c'.repeat(64),
    createdAt: '2026-11-10T03:00:00Z',
    createdByName: 'Nhân Viên',
    usages: [],
    ...over,
  }
}

export const page = <T,>(items: T[], totalItems = items.length) => ({
  items,
  page: 0,
  size: 40,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / 40)),
})

/** A File of the given size without allocating it. */
export function fakeFile(name: string, type: string, size = 1000): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
