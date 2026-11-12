import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { damApi, type AssetDetail, type AssetKind } from './damApi'
import { uploadProblem } from './uploadRules'

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'error' | 'duplicate'

export interface UploadItem {
  key: number
  name: string
  status: UploadStatus
  /** Why it failed */
  message?: string
  /** The new asset (done) or the one already in the library (duplicate) */
  assetId?: string
}

interface Job {
  key: number
  file: File
  folderId: number
}

/**
 * Files dropped or chosen, uploaded one at a time (the server takes one file per request) into the folder that was
 * open when they were added. Files that are too large or of the wrong type fail at once, without a request.
 */
export function useUploadQueue(onUploaded: (asset: AssetDetail) => void, kind: AssetKind | 'ANY' = 'ANY') {
  const [items, setItems] = useState<UploadItem[]>([])
  const jobs = useRef<Job[]>([])
  const running = useRef(false)
  const nextKey = useRef(1)
  const mounted = useRef(true)
  const uploaded = useRef(onUploaded)
  useEffect(() => {
    uploaded.current = onUploaded
  }, [onUploaded])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const update = useCallback((key: number, patch: Partial<UploadItem>) => {
    if (mounted.current) setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }, [])

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      for (let job = jobs.current.shift(); job; job = jobs.current.shift()) {
        update(job.key, { status: 'uploading' })
        try {
          const asset = await damApi.upload(job.file, job.folderId)
          update(job.key, { status: 'done', assetId: asset.id })
          uploaded.current(asset)
        } catch (err) {
          if (err instanceof ApiError && err.code === 'DUPLICATE_ASSET') {
            update(job.key, { status: 'duplicate', message: 'Đã có trong kho', assetId: String(err.details.assetId ?? '') })
          } else {
            update(job.key, { status: 'error', message: err instanceof Error ? err.message : 'Tải lên không thành công' })
          }
        }
      }
    } finally {
      running.current = false
    }
  }, [update])

  const add = useCallback(
    (files: Iterable<File>, folderId: number) => {
      const added: UploadItem[] = []
      for (const file of files) {
        const key = nextKey.current++
        const problem = uploadProblem(file, kind)
        added.push({ key, name: file.name, status: problem ? 'error' : 'waiting', message: problem ?? undefined })
        if (!problem) jobs.current.push({ key, file, folderId })
      }
      setItems((list) => [...list, ...added])
      void run()
    },
    [kind, run],
  )

  /** Forget the finished rows (the panel's "Xoá danh sách"). */
  const clearFinished = useCallback(() => setItems((list) => list.filter((i) => i.status === 'waiting' || i.status === 'uploading')), [])

  return { items, add, clearFinished, busy: items.some((i) => i.status === 'waiting' || i.status === 'uploading') }
}
