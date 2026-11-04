import { Link } from 'react-router'
import type { BlogCard as BlogCardData } from '../lib/blogApi'
import { formatDate } from '../lib/format'
import { cloudinaryUrl } from '../lib/images'

/** Cover (1200×630 proportions), title, excerpt, date and reading time; the whole card is one link. */
export default function BlogCard({ post, headingLevel = 'h2' }: { post: BlogCardData; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <article className="group h-full overflow-hidden rounded-2xl border border-stone-200 bg-white transition-transform duration-200 motion-safe:hover:-translate-y-0.5">
      <Link to={`/blog/${post.slug}`} className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        <div className="aspect-[40/21] w-full overflow-hidden bg-nut-light">
          {post.coverImageUrl && (
            <img
              src={cloudinaryUrl(post.coverImageUrl, 640, 336)}
              srcSet={`${cloudinaryUrl(post.coverImageUrl, 640, 336)} 640w, ${cloudinaryUrl(post.coverImageUrl, 960, 504)} 960w`}
              sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
              alt={post.coverImageAlt ?? ''}
              width={640}
              height={336}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition duration-300 motion-safe:group-hover:scale-[1.03]"
            />
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <Heading className="text-lg leading-snug font-bold text-stone-900 group-hover:text-brand-700">{post.title}</Heading>
          {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-stone-600">{post.excerpt}</p>}
          <p className="mt-auto pt-4 text-xs text-muted">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span aria-hidden="true" className="mx-1.5">
              ·
            </span>
            {post.readingMinutes} phút đọc
          </p>
        </div>
      </Link>
    </article>
  )
}
