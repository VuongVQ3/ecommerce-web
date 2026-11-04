import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import BlogCard from '../components/BlogCard'
import CopyButton from '../components/CopyButton'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import QuickViewHost from '../components/QuickView'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { blogApi, type BlogPostDetail } from '../lib/blogApi'
import { FACEBOOK_PATH, ZALO_PATH } from '../lib/brandIcons'
import { formatDate } from '../lib/format'
import { cloudinaryUrl } from '../lib/images'
import { consumeInitialData, peekInitialData } from '../lib/initialData'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

/** Shown at the end of every post. Same wording as the server-rendered page (BlogHtml.DISCLAIMER). */
export const BLOG_DISCLAIMER =
  'Thông tin trong bài chỉ mang tính tham khảo, không thay thế tư vấn của bác sĩ hay chuyên gia dinh dưỡng. Sản phẩm không phải là thuốc. Người dị ứng với các loại hạt cần cân nhắc trước khi dùng.'

/** The cover cropped to 1200×630 proportions (as the Open Graph image) at three widths; none for other hosts. */
function coverSrcSet(url: string): string | undefined {
  if (!url.includes('res.cloudinary.com')) return undefined
  return [480, 800, 1200].map((w) => `${cloudinaryUrl(url, w, Math.round((w * 630) / 1200))} ${w}w`).join(', ')
}

function BrandIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d={path} />
    </svg>
  )
}

const shareButtonClass =
  'inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-800 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none'

/**
 * Facebook (sharer link), Zalo and copy link. Zalo has no share link without its SDK: on phones (where people use
 * Zalo) the system share sheet lists it; elsewhere the link is copied with a hint to paste it into Zalo.
 */
function ShareButtons({ url, title }: { url: string; title: string }) {
  const toast = useToast()
  const shareZalo = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
      } catch {
        // Closed by the visitor
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast({ message: 'Đã sao chép link, dán vào Zalo để gửi.', tone: 'success' })
    } catch {
      toast({ message: 'Không sao chép được link. Hãy dùng nút "Sao chép link".', tone: 'error' })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-stone-700">Chia sẻ:</span>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={shareButtonClass}
      >
        <BrandIcon path={FACEBOOK_PATH} />
        Facebook
      </a>
      <button type="button" onClick={shareZalo} className={shareButtonClass}>
        <BrandIcon path={ZALO_PATH} />
        Zalo
      </button>
      <CopyButton text={url} label="Sao chép link" />
    </div>
  )
}

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // The server embeds the post on the first load: shown at once, no second request
  const [initial] = useState(() => peekInitialData<BlogPostDetail>('blogPost', slug))
  useEffect(() => consumeInitialData(), [])
  const fromServer = initial?.slug === slug ? initial : null
  const remote = useAsync((signal) => (fromServer ? Promise.resolve(fromServer) : blogApi.post(slug, signal)), [slug])
  const post = fromServer ?? (remote.data?.slug === slug || remote.data?.redirectTo ? remote.data : undefined)

  // Old address of a renamed post: move to the current one without a history entry
  const redirectTo = post?.redirectTo
  useEffect(() => {
    if (redirectTo && redirectTo !== slug) {
      navigate({ pathname: `/blog/${redirectTo}`, search: location.search, hash: location.hash }, { replace: true })
    }
  }, [redirectTo, slug, navigate, location.search, location.hash])

  const current = post?.slug === slug ? post : null
  usePageMeta(current && `${current.title} | ${BRAND}`, current?.excerpt)

  // Links inside the post to pages of this site open in the app (no full reload)
  const onContentClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')
    if (!link || !href?.startsWith('/') || href.startsWith('//') || link.target === '_blank') return
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }

  if (!fromServer && remote.error instanceof ApiError && remote.error.status === 404) return <NotFoundPage />
  if (!fromServer && remote.error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ErrorMessage message={remote.error.message} onRetry={remote.reload} />
      </div>
    )
  }
  if (!current) return <Spinner />

  const url = `${window.location.origin}/blog/${current.slug}`
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <article className="mx-auto max-w-3xl">
        <nav className="text-sm text-muted" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-brand-700">
            Trang chủ
          </Link>
          <span className="mx-2">/</span>
          <Link to="/blog" className="hover:text-brand-700">
            Blog
          </Link>
        </nav>
        <h1 className="mt-4 text-3xl leading-tight font-bold text-stone-900 md:text-4xl">{current.title}</h1>
        <p className="mt-3 text-sm text-muted">
          <time dateTime={current.publishedAt}>{formatDate(current.publishedAt)}</time>
          <span aria-hidden="true" className="mx-1.5">
            ·
          </span>
          {current.readingMinutes} phút đọc
        </p>
        {current.coverImageUrl && (
          // The largest element at the top: loaded first, never lazily
          <img
            src={cloudinaryUrl(current.coverImageUrl, 1200, 630)}
            srcSet={coverSrcSet(current.coverImageUrl)}
            sizes="(min-width: 768px) 768px, 100vw"
            alt={current.coverImageAlt ?? ''}
            width={1200}
            height={630}
            fetchPriority="high"
            decoding="async"
            className="mt-6 aspect-[40/21] w-full rounded-2xl bg-nut-light object-cover"
          />
        )}

        {/* contentHtml is produced by the server's Markdown renderer: raw HTML escaped, links and images checked */}
        <div
          className="prose-blog mt-8"
          onClick={onContentClick}
          dangerouslySetInnerHTML={{ __html: current.contentHtml }}
        />

        <aside className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-stone-700" aria-label="Lưu ý">
          <p>
            <strong className="font-semibold text-stone-900">Lưu ý: </strong>
            {BLOG_DISCLAIMER}
          </p>
        </aside>

        <div className="mt-8">
          <ShareButtons url={url} title={current.title} />
        </div>
      </article>

      {current.products.length > 0 && (
        <section className="mt-12" aria-labelledby="post-products">
          <h2 id="post-products" className="text-xl font-bold text-stone-900">
            Sản phẩm trong bài
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {current.products.map((p) => (
              <li key={p.id} className="flex min-w-0">
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {current.latest.length > 0 && (
        <section className="mt-12" aria-labelledby="post-latest">
          <h2 id="post-latest" className="text-xl font-bold text-stone-900">
            Bài viết mới
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {current.latest.map((p) => (
              <li key={p.id} className="min-w-0">
                <BlogCard post={p} headingLevel="h3" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* The product cards' quick view (?xem=): pages host their own */}
      <QuickViewHost />
    </div>
  )
}
