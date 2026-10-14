import { Link } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { CountUp, Marquee, ParallaxArea, Reveal, ScrollProgress, TiltCard } from '../components/landing/Motion'
import NutritionChart from '../components/landing/NutritionChart'
import ProductCard from '../components/ProductCard'
import QuickViewHost from '../components/QuickView'
import { api } from '../lib/api'
import { useInView } from '../lib/motion'
import { useAsync } from '../lib/useAsync'

const HEADLINE = ['Hạt', 'dinh', 'dưỡng', 'sạch', 'cho', 'vóc', 'dáng', 'khỏe', 'đẹp']

/** Decorative nuts floating around the hero bowl; each layer moves with the pointer at its own depth. */
const FLOATERS = [
  { emoji: '🌰', className: 'top-[6%] left-[8%] text-5xl', depth: '22px', delay: '0s' },
  { emoji: '🥜', className: 'top-[2%] right-[14%] text-4xl', depth: '-16px', delay: '1.2s' },
  { emoji: '🌱', className: 'bottom-[18%] left-[0%] text-4xl', depth: '-26px', delay: '0.6s' },
  { emoji: '🥣', className: 'bottom-[4%] right-[6%] text-5xl', depth: '18px', delay: '2s' },
  { emoji: '🫘', className: 'top-[44%] -right-[2%] text-3xl', depth: '30px', delay: '1.6s' },
]

const BENEFITS = [
  { icon: '🌿', title: 'Rang mộc, không dầu', text: 'Giữ trọn vị bùi tự nhiên và dưỡng chất của từng loại hạt.' },
  { icon: '📊', title: 'Minh bạch dinh dưỡng', text: 'Calo, protein, chất béo, carb, chất xơ cho mỗi 100g.' },
  { icon: '🚚', title: 'Giao hàng toàn quốc', text: 'Đóng gói hút chân không, luôn giòn thơm khi đến tay bạn.' },
  { icon: '↩️', title: 'Đổi trả trong 7 ngày', text: 'Không ưng ý? Liên hệ để được đổi trả nhanh chóng.' },
]

const STEPS = [
  { icon: '🥄', title: 'Một nắm mỗi ngày', text: 'Khoảng 30g hạt là đủ cho bữa phụ, vừa no lâu vừa không dư calo.' },
  { icon: '🥣', title: 'Kết hợp bữa sáng', text: 'Rắc hạt chia, hạnh nhân vào sữa chua, yến mạch hoặc sinh tố.' },
  { icon: '🏃', title: 'Nạp năng lượng khi tập', text: 'Hạt giàu protein như bí xanh, dẻ cười giúp phục hồi sau buổi tập.' },
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
            Ăn kiêng lành mạnh mỗi ngày
          </p>
          <h1 className="mt-5 text-4xl leading-tight font-extrabold text-brand-900 sm:text-5xl md:text-6xl">
            {HEADLINE.map((word, i) => (
              <span key={i} className="word-in mr-[0.25em]" style={{ animationDelay: `${150 + i * 70}ms` }}>
                {word === 'sạch' ? (
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
            Hạnh nhân, óc chó, macca, hạt chia và hơn thế nữa. Rang mộc, rõ nguồn gốc, minh bạch từng chỉ số dinh dưỡng.
          </p>
          <div className="word-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: '1000ms' }}>
            <Link
              to="/san-pham"
              className="btn-shine rounded-full bg-brand-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700"
            >
              Mua sắm ngay →
            </Link>
            <Link
              to="/san-pham?sort=calories_asc"
              className="rounded-full border border-brand-200 bg-white/80 px-7 py-3.5 font-semibold text-brand-700 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
            >
              Ít calo nhất
            </Link>
          </div>
          {productCount !== undefined && (
            <p className="word-in mt-6 text-sm text-muted" style={{ animationDelay: '1150ms' }}>
              {productCount} loại hạt và ngũ cốc · Miễn phí giao hàng cho đơn từ 500.000₫
            </p>
          )}
        </div>

        <div aria-hidden className="relative mx-auto aspect-square w-full max-w-sm">
          <div className="parallax absolute inset-[12%] rounded-full bg-gradient-to-br from-white to-nut-light shadow-2xl shadow-nut/20 [--depth:8px]" />
          <div className="parallax absolute inset-[24%] flex items-center justify-center rounded-full bg-white/70 text-[7rem] [--depth:-10px]">
            <span className="floaty">🌰</span>
          </div>
          {FLOATERS.map((f) => (
            <div key={f.emoji} className={`parallax absolute ${f.className}`} style={{ ['--depth' as string]: f.depth }}>
              <span className="floaty inline-block drop-shadow-md" style={{ animationDelay: f.delay }}>
                {f.emoji}
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
    { value: products, suffix: '+', label: 'loại hạt & ngũ cốc' },
    { value: categories, suffix: '', label: 'nhóm sản phẩm' },
    { value: 500, suffix: 'K', label: 'đơn từ mức này được miễn phí ship' },
    { value: 7, suffix: ' ngày', label: 'đổi trả dễ dàng' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4">
      <div className="grid grid-cols-2 gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-4 md:p-8">
        {items.map((s, i) => (
          <Reveal key={s.label} delay={i * 100} className="text-center">
            <CountUp value={s.value} suffix={s.suffix} className="block text-3xl font-extrabold text-brand-700 md:text-4xl" />
            <p className="mt-1 text-sm text-muted">{s.label}</p>
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
  const categories = useAsync((signal) => api.categories(signal), [])
  // One request feeds the hero count, ticker, nutrition chart and featured grid
  const catalog = useAsync((signal) => api.products({ sort: 'protein_desc', size: 48 }, signal), [])
  const products = catalog.data?.items ?? []
  const featured = products.slice(0, 8)

  return (
    <>
      <ScrollProgress />
      <Hero productCount={catalog.data?.totalItems} />

      <div className="border-y border-brand-800 bg-brand-800 py-4 text-sm font-semibold text-brand-50 md:text-base">
        <Marquee
          items={
            products.length > 0
              ? products.slice(0, 10).map((p) => p.name)
              : ['Hạnh nhân', 'Óc chó', 'Macca', 'Hạt chia', 'Hạt điều', 'Granola']
          }
        />
      </div>

      {catalog.data && categories.data && (
        <div className="mt-14">
          <Stats products={catalog.data.totalItems} categories={categories.data.length} />
        </div>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionTitle eyebrow="Vì sao chọn Hạt Lành" title="Ngon, sạch và minh bạch" />
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

      {/* overflow-x-clip: the chart slides in from the right and must not widen the page while it does */}
      <section className="mx-auto grid max-w-6xl gap-10 overflow-x-clip px-4 pt-20 md:grid-cols-2 md:items-center">
        <div>
          <SectionTitle eyebrow="Dinh dưỡng" title="So sánh nhanh từng loại hạt">
            Số liệu lấy từ chính các sản phẩm đang bán. Chọn protein để tăng cơ, hoặc năng lượng thấp để giữ dáng.
          </SectionTitle>
          <Steps />
        </div>
        <Reveal from="right">
          {catalog.error ? (
            <ErrorMessage message={catalog.error.message} onRetry={catalog.reload} />
          ) : products.length > 0 ? (
            <NutritionChart products={products} />
          ) : (
            <Spinner />
          )}
        </Reveal>
      </section>

      {categories.data && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <SectionTitle eyebrow="Danh mục" title="Tìm đúng loại hạt bạn cần" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {categories.data.map((c, i) => (
              <Reveal key={c.id} delay={i * 120}>
                <Link
                  to={`/danh-muc/${c.slug}`}
                  className="group relative block overflow-hidden rounded-2xl bg-brand-800 px-6 py-10 text-lg font-semibold text-white"
                >
                  <span
                    aria-hidden
                    className="absolute -right-6 -bottom-8 text-8xl opacity-20 transition duration-500 group-hover:scale-125 group-hover:-rotate-12 group-hover:opacity-40"
                  >
                    {['🌰', '🌱', '🥣'][i % 3]}
                  </span>
                  <span className="relative">{c.name}</span>
                  <span aria-hidden className="relative ml-2 inline-block transition group-hover:translate-x-1.5">
                    →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle eyebrow="Bán chạy" title="Giàu protein nhất" />
          <Link to="/san-pham" className="text-sm font-semibold text-brand-700 hover:underline">
            Xem tất cả →
          </Link>
        </div>
        <div className="mt-8">
          {catalog.error ? (
            <ErrorMessage message={catalog.error.message} onRetry={catalog.reload} />
          ) : !catalog.data ? (
            <Spinner />
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
            <h2 className="relative text-3xl font-extrabold md:text-4xl">Bắt đầu thói quen ăn hạt hôm nay</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-brand-50">
              Miễn phí giao hàng cho đơn từ 500.000₫. Rang mộc, đóng gói hút chân không, giao tận nơi.
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
