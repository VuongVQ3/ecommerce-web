import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { sharedRequest } from '../lib/sharedRequest'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { CountUp, Marquee, ParallaxArea, Reveal, ScrollProgress, TiltCard } from '../components/landing/Motion'
import { CashewIcon, DriedMangoIcon, HoneyJarIcon, PumpkinSeedsIcon, SproutIcon, WalnutIcon } from '../components/landing/MastheadIcons'
import NutritionChart from '../components/landing/NutritionChart'
import ProductCard from '../components/ProductCard'
import QuickViewHost from '../components/QuickView'
import { api } from '../lib/api'
import { categoryEmoji } from '../lib/categoryStyle'
import { useInView } from '../lib/motion'
import { MIN_PRODUCTS_WITH_NUTRITION, withNutrition } from '../lib/nutrition'
import { useAsync } from '../lib/useAsync'

const HEADLINE = ['Hạt', 'dinh', 'dưỡng', '&', 'đặc', 'sản', 'chọn', 'lọc']
/** Drawn with the moving gradient */
const HIGHLIGHT = new Set(['đặc', 'sản'])

/**
 * Decorative products floating around the hero logo, one every 60° (angle counted anticlockwise from the right).
 * Each sits clear of the outer ring (radius 38% of the box) by 14px plus half its `span` (in rem; the sprout keeps
 * the wider span of the emoji it replaced, so it stays where it was); the lower ones also by the 14px the float lifts
 * them towards the ring. Each layer moves with the pointer at its own depth.
 */
const FLOATERS: { id: string; icon: ReactNode; size: string; span: number; angle: number; depth: string; delay: string }[] = [
  { id: 'walnut', icon: <WalnutIcon />, size: 'text-5xl', span: 3, angle: 120, depth: '22px', delay: '0s' },
  { id: 'cashew', icon: <CashewIcon />, size: 'text-4xl', span: 2.25, angle: 60, depth: '-16px', delay: '1.2s' },
  { id: 'pumpkin-seeds', icon: <PumpkinSeedsIcon />, size: 'text-3xl', span: 1.875, angle: 0, depth: '30px', delay: '1.6s' },
  { id: 'mango', icon: <DriedMangoIcon />, size: 'text-5xl', span: 3, angle: 300, depth: '18px', delay: '2s' },
  { id: 'sprout', icon: <SproutIcon />, size: 'text-4xl', span: 3, angle: 240, depth: '-26px', delay: '0.6s' },
  { id: 'honey', icon: <HoneyJarIcon />, size: 'text-4xl', span: 2.25, angle: 180, depth: '-20px', delay: '0.9s' },
]

function floaterPosition({ span, angle }: { span: number; angle: number }): CSSProperties {
  const rad = (angle * Math.PI) / 180
  const lift = Math.max(0, -Math.sin(rad)) * 14
  const radius = `(38% + ${span / 2}rem + ${(14 + lift).toFixed(1)}px)`
  const x = Math.cos(rad).toFixed(3)
  const y = (-Math.sin(rad)).toFixed(3)
  return { left: `calc(50% + ${x} * ${radius})`, top: `calc(50% + ${y} * ${radius})` }
}

const BENEFITS = [
  { icon: '🔎', title: 'Chọn lọc kỹ', text: 'Hạt đều, chắc, không sâu mọt.' },
  { icon: '📦', title: 'Đóng gói 500 g', text: 'Gói kín, giữ hạt giòn thơm khi đến tay bạn.' },
  { icon: '🚚', title: 'Giao hàng toàn quốc', text: 'Giao tận nơi, thanh toán khi nhận hàng.' },
  { icon: '↩️', title: 'Đổi trả trong 7 ngày', text: 'Không ưng ý? Liên hệ để được đổi trả nhanh chóng.' },
]

const STEPS = [
  { icon: '🥄', title: 'Một nắm mỗi ngày', text: 'Khoảng 30g hạt là đủ cho bữa phụ, vừa no lâu vừa không dư calo.' },
  { icon: '🥣', title: 'Kết hợp bữa sáng', text: 'Rắc hạnh nhân, mắc ca vào sữa chua, yến mạch.' },
  { icon: '🥛', title: 'Sữa hạt tại nhà', text: 'Hạt điều vỡ, mắc ca vỡ hợp nấu sữa hạt tại nhà.' },
]

function Hero({ productCount }: { productCount?: number }) {
  return (
    <section className="relative isolate overflow-hidden bg-cream">
      {/* Drifting color blobs */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="blob absolute -top-24 -left-24 size-80 rounded-full bg-brand-200/70 blur-3xl" />
        <div className="blob absolute top-1/3 -right-20 size-96 rounded-full bg-amber-200/60 blur-3xl [animation-delay:-6s]" />
        <div className="blob absolute -bottom-32 left-1/3 size-80 rounded-full bg-nut-light blur-3xl [animation-delay:-12s]" />
      </div>

      <ParallaxArea className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="word-in inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-sm font-medium text-brand-700 backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
            </span>
            Hạt ngon chọn lọc mỗi ngày
          </p>
          <h1 aria-label={HEADLINE.join(' ')} className="mt-5 text-4xl leading-tight font-extrabold text-brand-900 sm:text-5xl md:text-6xl">
            {HEADLINE.map((word, i) => (
              // Words are separate boxes (no spaces in the text): the heading's aria-label gives the sentence
              <span key={i} aria-hidden className="word-in mr-[0.25em] inline-block" style={{ animationDelay: `${150 + i * 70}ms` }}>
                {HIGHLIGHT.has(word) ? (
                  <span className="gradient-pan bg-gradient-to-r from-brand-600 via-amber-500 to-brand-600 bg-clip-text text-transparent">
                    {word}
                  </span>
                ) : (
                  word
                )}
              </span>
            ))}
          </h1>
          <p className="word-in mt-5 max-w-md text-lg text-stone-600" style={{ animationDelay: '850ms' }}>
            Mắc ca, hạt điều, hạnh nhân, óc chó cùng các món bánh, trái cây sấy và mật ong. Chọn lọc kỹ, đóng gói 500 g tiện
            dùng.
          </p>
          {/* Under 400px: stacked, full width */}
          <div className="word-in mt-8 flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap" style={{ animationDelay: '1000ms' }}>
            <Link
              to="/san-pham"
              className="btn-shine inline-flex items-center justify-center rounded-full whitespace-nowrap bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700"
            >
              Mua sắm ngay →
            </Link>
            <Link
              to="/danh-muc/hat-dinh-duong"
              className="inline-flex items-center justify-center rounded-full whitespace-nowrap border border-brand-200 bg-white/80 px-7 py-3.5 font-semibold text-brand-700 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
            >
              Xem hạt dinh dưỡng
            </Link>
          </div>
          {productCount !== undefined && (
            <p className="word-in mt-6 text-sm text-muted" style={{ animationDelay: '1150ms' }}>
              {productCount} sản phẩm · Miễn phí giao hàng cho đơn từ 500.000₫
            </p>
          )}
        </div>

        <div aria-hidden className="relative mx-auto aspect-square w-full max-w-sm">
          <div className="parallax absolute inset-[12%] rounded-full bg-gradient-to-br from-white to-nut-light shadow-2xl shadow-nut/20 [--depth:8px]" />
          <div className="parallax absolute inset-[24%] flex items-center justify-center rounded-full bg-white/70 text-[7rem] [--depth:-10px]">
            <img
              src="/brand/logo-hat-lanh-masthead.webp"
              alt=""
              width={444}
              height={406}
              fetchPriority="high"
              className="floaty w-[70%] drop-shadow-md"
            />
          </div>
          {FLOATERS.map((f) => (
            <div
              key={f.id}
              className={`parallax absolute -translate-x-1/2 -translate-y-1/2 leading-none ${f.size}`}
              style={{ ...floaterPosition(f), ['--depth' as string]: f.depth }}
            >
              <span className="floaty inline-block drop-shadow-md" style={{ animationDelay: f.delay }}>
                {f.icon}
              </span>
            </div>
          ))}
        </div>
      </ParallaxArea>
    </section>
  )
}

function Stats({ products, categories }: { products: number; categories: number }) {
  const items = [
    { value: products, suffix: '', label: 'sản phẩm' },
    { value: categories, suffix: '', label: 'nhóm sản phẩm' },
    { value: 500, suffix: 'K', label: 'đơn từ mức này được miễn phí ship' },
    { value: 7, suffix: ' ngày', label: 'đổi trả dễ dàng' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4">
      {/* Phones: room on the right for the floating buttons in the corner */}
      <div className="grid grid-cols-2 gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm max-sm:pr-14 md:grid-cols-4 md:p-8">
        {items.map((s, i) => (
          <Reveal key={s.label} delay={i * 100} className="text-center">
            <CountUp value={s.value} suffix={s.suffix} className="block text-[clamp(1.5rem,7vw,1.875rem)] font-extrabold whitespace-nowrap text-brand-700 md:text-4xl" />
            <p className="mt-1 line-clamp-2 text-sm text-muted">{s.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="text-sm font-semibold tracking-widest text-nut uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold text-stone-900 md:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-stone-600">{children}</p>}
    </Reveal>
  )
}

function Steps() {
  const [ref, visible] = useInView<HTMLOListElement>()
  return (
    <ol ref={ref} className={`relative mt-10 space-y-8 pl-10 ${visible ? 'is-visible' : ''}`}>
      <span aria-hidden className="draw-line absolute top-2 bottom-2 left-[1.05rem] w-0.5 bg-gradient-to-b from-brand-500 to-amber-500" />
      {STEPS.map((step, i) => (
        <li key={step.title} className="relative">
          <span
            aria-hidden
            className="absolute top-0 -left-10 flex size-9 items-center justify-center rounded-full bg-white text-lg shadow ring-2 ring-brand-200"
          >
            {step.icon}
          </span>
          <Reveal from="left" delay={200 + i * 250}>
            <h3 className="font-bold text-stone-900">
              <span className="mr-2 text-brand-600 tabular-nums">0{i + 1}</span>
              {step.title}
            </h3>
            <p className="mt-1 text-stone-600">{step.text}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

export default function HomePage() {
  // Shared: StrictMode's double effect or a remount (session refresh) reuses the request in flight
  const categories = useAsync(() => sharedRequest('categories', () => api.categories()), [])
  // One request feeds the hero count, ticker, nutrition chart and featured grid; the shop's own order (sort_order)
  const catalog = useAsync(() => sharedRequest('products|default|48', () => api.products({ size: 48 })), [])
  const products = catalog.data?.items ?? []
  const featured = products.slice(0, 8)
  // The comparison only makes sense once enough products have their nutrition facts
  const comparable = withNutrition(products).length >= MIN_PRODUCTS_WITH_NUTRITION

  return (
    <>
      <ScrollProgress />
      <Hero productCount={catalog.data?.totalItems} />

      <div className="border-y border-brand-800 bg-brand-800 py-4 text-sm font-semibold text-brand-50 md:text-base">
        <Marquee
          items={
            products.length > 0
              ? products.slice(0, 10).map((p) => p.name)
              : ['Mắc ca', 'Hạt điều', 'Hạnh nhân', 'Óc chó', 'Bánh thuyền', 'Mật ong']
          }
        />
      </div>

      {catalog.data && categories.data && catalog.data.totalItems > 0 && (
        <div className="mt-14">
          <Stats products={catalog.data.totalItems} categories={categories.data.length} />
        </div>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionTitle eyebrow="Vì sao chọn Hạt Lành" title="Chọn lọc kỹ, giao tận nơi" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 110} from="scale">
              <TiltCard className="h-full rounded-2xl border border-stone-200 bg-white p-6">
                <p className="text-3xl" aria-hidden>
                  {b.icon}
                </p>
                <h3 className="mt-3 font-bold text-stone-900">{b.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{b.text}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* overflow-x-clip: the chart slides in from the right and must not widen the page while it does. Only with at
          least 3 products whose nutrition facts are known (the tips go with it). */}
      {comparable && (
        <section className="mx-auto grid max-w-6xl gap-10 overflow-x-clip px-4 pt-20 md:grid-cols-2 md:items-center">
          <div>
            <SectionTitle eyebrow="Dinh dưỡng" title="So sánh nhanh từng loại hạt">
              Số liệu trên 100g, lấy từ chính các sản phẩm đang bán.
            </SectionTitle>
            <Steps />
          </div>
          <Reveal from="right">
            {catalog.error ? (
              <ErrorMessage message={catalog.error.message} onRetry={catalog.reload} />
            ) : (
              <NutritionChart products={products} />
            )}
          </Reveal>
        </section>
      )}

      {categories.data && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <SectionTitle eyebrow="Danh mục" title="Chọn theo nhóm sản phẩm" />
          {/* Every card fills its grid cell (h-full through Reveal), so a row is as tall as its tallest card */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {categories.data.map((c, i) => (
              <Reveal key={c.id} delay={i * 120} className="h-full">
                <Link
                  to={`/danh-muc/${c.slug}`}
                  className="group flex h-full min-h-36 flex-col gap-4 rounded-2xl bg-brand-800 p-4 text-white transition duration-300 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none sm:p-5"
                >
                  {/* Phones: the emoji above the name (side by side the name would need 3 lines in a ~160px card) */}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <span className="line-clamp-2 text-base leading-snug font-semibold sm:text-lg">{c.name}</span>
                    <span
                      aria-hidden
                      className="grid size-12 shrink-0 place-items-center self-end rounded-full bg-white/10 sm:size-14 sm:self-auto"
                    >
                      <span className="text-3xl transition duration-500 group-hover:scale-110 group-hover:-rotate-12 sm:text-4xl">
                        {categoryEmoji(c.slug)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 text-sm">
                    <span className="text-white/70">{c.productCount} sản phẩm</span>
                    <span aria-hidden className="text-lg transition group-hover:translate-x-1.5">
                      →
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle eyebrow="Gợi ý" title="Sản phẩm nổi bật" />
          <Link to="/san-pham" className="text-sm font-semibold text-brand-700 hover:underline">
            Xem tất cả →
          </Link>
        </div>
        <div className="mt-8">
          {catalog.error ? (
            <ErrorMessage message={catalog.error.message} onRetry={catalog.reload} />
          ) : !catalog.data ? (
            <Spinner />
          ) : featured.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-stone-600">
              Sản phẩm đang được cập nhật. Mời bạn quay lại sau ít phút.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {featured.map((p, i) => (
                <Reveal key={p.id} delay={(i % 4) * 90} className="flex min-w-0">
                  <ProductCard product={p} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <Reveal from="scale">
          <div className="gradient-pan relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-800 via-brand-600 to-nut px-6 py-12 text-center text-white md:px-12 md:py-16">
            <span aria-hidden className="floaty absolute -top-4 left-6 text-6xl opacity-30">
              🌰
            </span>
            <span aria-hidden className="floaty absolute right-8 -bottom-6 text-7xl opacity-30 [animation-delay:-3s]">
              🥜
            </span>
            <h2 className="relative text-3xl font-extrabold md:text-4xl">Đặt hàng ngay hôm nay</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-brand-50">
              Miễn phí giao hàng cho đơn từ 500.000₫. Đóng gói 500 g, giao tận nơi.
            </p>
            <Link
              to="/san-pham"
              className="btn-shine relative mt-8 inline-block rounded-full bg-white px-8 py-3.5 font-bold text-brand-800 shadow-lg transition hover:-translate-y-0.5"
            >
              Khám phá sản phẩm
            </Link>
          </div>
        </Reveal>
      </section>
      <QuickViewHost />
    </>
  )
}
