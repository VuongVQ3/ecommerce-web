import { FileDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatPrice } from '../lib/format'
import type { DeliveredAsset, DeliveredBlock, DeliveredFragment, DeliveredMarkdown, ProductCardData } from './pageTypes'

type Props = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const asset = (v: unknown) => (v && typeof v === 'object' && 'url' in v ? (v as DeliveredAsset) : null)
const md = (v: unknown) => (v && typeof v === 'object' && 'html' in v ? (v as DeliveredMarkdown) : null)
const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

/** An internal path opens in the app, anything else in a new tab. */
function SmartLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  if (to.startsWith('/') && !to.startsWith('//')) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={to} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

/** Sanitized on the server (raw HTML in Markdown is escaped there). */
function Html({ value }: { value: DeliveredMarkdown | null }) {
  if (!value) return null
  return <div className="prose-blog" dangerouslySetInnerHTML={{ __html: value.html }} />
}

const buttonStyle: Record<string, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-brand-600 bg-white text-brand-700 hover:bg-brand-50',
  dark: 'bg-stone-900 text-white hover:bg-stone-700',
}

function Hero({ p }: { p: Props }) {
  const image = asset(p.image)
  const align = str(p.align) || 'left'
  const alignClass = align === 'center' ? 'items-center text-center' : align === 'right' ? 'items-end text-right' : 'items-start text-left'
  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-900 text-white">
      {image && <img src={image.renditions.hero ?? image.url} alt={image.alt ?? ''} className="absolute inset-0 size-full object-cover opacity-60" />}
      <div className={`relative flex min-h-72 flex-col justify-center gap-4 px-6 py-14 md:px-12 ${alignClass}`}>
        <h2 className="max-w-2xl text-3xl font-extrabold leading-tight md:text-5xl">{str(p.headline)}</h2>
        {str(p.subline) && <p className="max-w-xl text-lg text-white/90">{str(p.subline)}</p>}
        {str(p.ctaLabel) && str(p.ctaLink) && (
          <SmartLink to={str(p.ctaLink)} className="rounded-full bg-white px-6 py-3 font-semibold text-brand-800 hover:bg-brand-50">
            {str(p.ctaLabel)}
          </SmartLink>
        )}
      </div>
    </section>
  )
}

function ImageBlock({ p }: { p: Props }) {
  const image = asset(p.asset)
  if (!image) return null
  const img = <img src={image.renditions.hero ?? image.url} alt={image.alt ?? ''} width={image.width ?? undefined} height={image.height ?? undefined} className="w-full rounded-2xl" />
  return (
    <figure>
      {str(p.link) ? <SmartLink to={str(p.link)}>{img}</SmartLink> : img}
      {str(p.caption) && <figcaption className="mt-2 text-center text-sm text-stone-600">{str(p.caption)}</figcaption>}
    </figure>
  )
}

function ImageText({ p }: { p: Props }) {
  const image = asset(p.asset)
  return (
    <section className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
      {image && (
        <img
          src={image.renditions.card ?? image.url}
          alt={image.alt ?? ''}
          className={`w-full rounded-2xl ${str(p.imageSide) === 'right' ? 'md:order-2' : ''}`}
        />
      )}
      <Html value={md(p.markdown)} />
    </section>
  )
}

function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link to={`/san-pham/${product.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white hover:shadow-md">
      <span className="aspect-square overflow-hidden bg-stone-100">
        {product.image && <img src={product.image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 font-medium text-stone-900">{product.name}</span>
        <span className="mt-auto font-bold text-brand-700">{formatPrice(product.price)}</span>
      </span>
    </Link>
  )
}

function Products({ p, carousel }: { p: Props; carousel: boolean }) {
  const products = list<ProductCardData>(p.products)
  if (!products.length) return null
  return (
    <section>
      {str(p.title) && <h2 className="mb-4 text-2xl font-bold text-stone-900">{str(p.title)}</h2>}
      {carousel ? (
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {products.map((product) => (
            <li key={product.id} className="w-44 shrink-0 snap-start md:w-56">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** A fragment shown generically: its title and, in full, every field (text, markdown, images, lists). */
function FragmentView({ fragment, display }: { fragment: DeliveredFragment; display: string }) {
  const data = fragment.data ?? {}
  const values = Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
  const firstText = values.map(([, v]) => (typeof v === 'string' ? v : md(v)?.markdown)).find(Boolean)
  if (display !== 'full') {
    const image = values.map(([, v]) => asset(v)).find((a) => a?.kind === 'IMAGE')
    return (
      <article className="flex h-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4">
        {image && <img src={image.renditions.card ?? image.url} alt={image.alt ?? ''} className="rounded-xl" />}
        <h3 className="font-bold text-stone-900">{fragment.title}</h3>
        {firstText && <p className="line-clamp-3 text-sm text-stone-600">{firstText}</p>}
      </article>
    )
  }
  return (
    <article className="flex flex-col gap-3">
      <h3 className="text-xl font-bold text-stone-900">{fragment.title}</h3>
      {values.map(([key, value]) => {
        const a = asset(value)
        if (a) return a.kind === 'IMAGE' ? <img key={key} src={a.renditions.card ?? a.url} alt={a.alt ?? ''} className="rounded-xl" /> : null
        const m = md(value)
        if (m) return <Html key={key} value={m} />
        if (typeof value === 'string' || typeof value === 'number') return <p key={key} className="text-stone-700">{value}</p>
        if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return <p key={key} className="text-stone-700">{value.join(' · ')}</p>
        return null
      })}
    </article>
  )
}

function Faq({ p }: { p: Props }) {
  const items = list<DeliveredFragment>(p.items)
  if (!items.length) return null
  return (
    <section>
      {str(p.title) && <h2 className="mb-4 text-2xl font-bold text-stone-900">{str(p.title)}</h2>}
      <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        {items.map((item) => (
          <details key={item.id} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold text-stone-900 marker:hidden">
              {str(item.data?.question) || item.title}
            </summary>
            <div className="mt-3">
              <Html value={md(item.data?.answer)} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function Cta({ p }: { p: Props }) {
  const style = str(p.style) || 'primary'
  return (
    <section className={`flex flex-col items-center gap-4 rounded-3xl px-6 py-10 text-center md:flex-row md:justify-between md:text-left ${style === 'dark' ? 'bg-stone-900 text-white' : 'bg-brand-50 text-stone-900'}`}>
      <p className="text-xl font-bold">{str(p.text)}</p>
      <SmartLink to={str(p.link) || '/'} className={`shrink-0 rounded-full px-6 py-3 font-semibold ${buttonStyle[style] ?? buttonStyle.primary}`}>
        {str(p.buttonLabel)}
      </SmartLink>
    </section>
  )
}

function Marquee({ p }: { p: Props }) {
  const items = list<string>(p.items)
  if (!items.length) return null
  const row = items.join('   •   ')
  return (
    <div className="overflow-hidden rounded-xl bg-brand-700 py-2 text-sm font-semibold text-white" role="marquee" aria-label={items.join(', ')}>
      <div className="flex w-max gap-12 whitespace-nowrap motion-safe:animate-[cms-marquee_30s_linear_infinite]" aria-hidden>
        <span>{row}</span>
        <span>{row}</span>
      </div>
    </div>
  )
}

function PdfDownload({ p }: { p: Props }) {
  const file = asset(p.asset)
  if (!file) return null
  return (
    <a href={file.stableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4 font-semibold text-stone-900 hover:border-brand-500">
      <FileDown aria-hidden className="size-6 text-brand-700" />
      <span>
        {str(p.label) || file.title}
        {file.pageCount && <span className="block text-sm font-normal text-stone-500">PDF · {file.pageCount} trang</span>}
      </span>
    </a>
  )
}

const SPACER: Record<string, string> = { sm: 'h-4', md: 'h-10', lg: 'h-20' }
const COLUMNS: Record<string, string> = { '1': 'md:grid-cols-1', '2': 'md:grid-cols-2', '3': 'md:grid-cols-3' }

function Block({ block }: { block: DeliveredBlock }) {
  const p = block.props ?? {}
  switch (block.type) {
    case 'hero':
      return <Hero p={p} />
    case 'rich-text':
      return <Html value={md(p.markdown)} />
    case 'image':
      return <ImageBlock p={p} />
    case 'image-text':
      return <ImageText p={p} />
    case 'product-grid':
      return <Products p={p} carousel={false} />
    case 'product-carousel':
      return <Products p={p} carousel />
    case 'fragment': {
      const fragment = p.fragment as DeliveredFragment | null
      return fragment ? <FragmentView fragment={fragment} display={str(p.display) || 'card'} /> : null
    }
    case 'fragment-list': {
      const items = list<DeliveredFragment>(p.items)
      const display = str(p.display) || 'card'
      return items.length ? (
        <div className={display === 'full' ? 'flex flex-col gap-8' : 'grid gap-4 md:grid-cols-3'}>
          {items.map((f) => (
            <FragmentView key={f.id} fragment={f} display={display} />
          ))}
        </div>
      ) : null
    }
    case 'faq':
      return <Faq p={p} />
    case 'cta':
      return <Cta p={p} />
    case 'marquee':
      return <Marquee p={p} />
    case 'pdf-download':
      return <PdfDownload p={p} />
    case 'spacer':
      return <div aria-hidden className={SPACER[str(p.size)] ?? SPACER.md} />
    case 'container':
      return (
        <div className={`grid gap-6 ${COLUMNS[str(p.columns)] ?? COLUMNS['2']}`}>
          {(block.children ?? []).map((child) => (
            <BlockSlot key={child.id} block={child} />
          ))}
        </div>
      )
    default:
      // A component this version of the app does not know: skip it, keep the rest of the page
      console.warn(`CMS: unknown block type "${block.type}" (${block.id}) skipped`)
      return null
  }
}

function BlockSlot({ block }: { block: DeliveredBlock }) {
  return (
    <div data-block={block.type} data-block-id={block.id}>
      <Block block={block} />
    </div>
  )
}

/** The blocks of a page region, top to bottom. */
export default function BlockRenderer({ blocks }: { blocks: DeliveredBlock[] }) {
  return (
    <div className="flex flex-col gap-10">
      {blocks.map((block) => (
        <BlockSlot key={block.id} block={block} />
      ))}
    </div>
  )
}
