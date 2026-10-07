export function Spinner({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-500" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      {label}
    </div>
  )
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold underline">
          Thử lại
        </button>
      )}
    </div>
  )
}
