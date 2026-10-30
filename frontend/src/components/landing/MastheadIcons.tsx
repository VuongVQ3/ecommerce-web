import type { ReactNode } from 'react'

/**
 * Decorative product icons floating around the home masthead logo, drawn like the logo itself: thin brown outline,
 * flat warm fills with a soft gradient and one small highlight. Inline SVG (emoji look different on every OS);
 * 1em square, so the parent's font size sets the size. Always decorative: aria-hidden.
 */
const OUTLINE = '#4a2a14'

type IconProps = { className?: string }

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" width="1em" height="1em" className={className}>
      {children}
    </svg>
  )
}

/** Red walnut kernel: two lobes with a centre groove, brick-red skin */
export function WalnutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <linearGradient id="mh-walnut" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c0563a" />
          <stop offset="1" stopColor="#7c2c1c" />
        </linearGradient>
      </defs>
      <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="url(#mh-walnut)">
        <path d="M31 9c-7-3-16 1-19 8-4 2-6 8-4 13-3 5-1 12 4 15 1 6 8 10 14 8 2 2 4 2 5 1V9Z" />
        <path d="M33 9c7-3 16 1 19 8 4 2 6 8 4 13 3 5 1 12-4 15-1 6-8 10-14 8-2 2-4 2-5 1V9Z" />
      </g>
      <g stroke={OUTLINE} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M14 22c4 0 7 2 9 5M12 35c4-2 8-1 11 2M18 46c2-3 5-4 8-3" />
        <path d="M50 22c-4 0-7 2-9 5M52 35c-4-2-8-1-11 2M46 46c-2-3-5-4-8-3" />
      </g>
      <path d="M17 15c3-3 7-4 10-3" stroke="#f6c9a8" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.85" />
    </Svg>
  )
}

/** Cashew: a cream C-shaped kernel */
export function CashewIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <linearGradient id="mh-cashew" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbecc8" />
          <stop offset="1" stopColor="#dcb376" />
        </linearGradient>
      </defs>
      <path
        d="M22 8c15-4 32 7 33 24 1 15-10 26-24 26-9 0-15-6-14-12 1-6 8-8 13-6 6 2 11-2 11-8 0-7-7-11-14-9-8 2-14-2-14-8 0-4 4-7 9-7Z"
        fill="url(#mh-cashew)"
        stroke={OUTLINE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M44 22c3 4 4 10 2 15" stroke={OUTLINE} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M24 12c6-1 12 0 17 4" stroke="#fffaf0" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

const SEED = 'M0-17C9-17 12-6 10 3 8 12 3 17 0 19-3 17-8 12-10 3-12-6-9-17 0-17Z'

/** Three shelled pumpkin seeds, scattered: flat green teardrops with a pale rim */
export function PumpkinSeedsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <linearGradient id="mh-seed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fae45" />
          <stop offset="1" stopColor="#3f6b22" />
        </linearGradient>
      </defs>
      {['translate(20 22) rotate(-62)', 'translate(44 26) rotate(28)', 'translate(30 41) rotate(-8)'].map((t) => (
        <g key={t} transform={t}>
          <path d={SEED} fill="#d8e6a6" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
          <path d={SEED} transform="scale(0.72)" fill="url(#mh-seed)" />
          <path d="M-4-10c-2 3-3 7-2 11" stroke="#eaf5cc" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      ))}
    </Svg>
  )
}

/** A slice of dried mango: ragged, flat yellow-orange oval, deeper orange towards the middle, with fibres */
export function DriedMangoIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <radialGradient id="mh-mango" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#f08a1c" />
          <stop offset="0.65" stopColor="#f9b232" />
          <stop offset="1" stopColor="#fdd46a" />
        </radialGradient>
      </defs>
      <path d="M54.3 20.8Q56.1 22.3 56.2 24.6Q56.3 26.9 56.5 29.3Q56.8 31.6 54.3 34.1Q51.8 36.6 50 39.2Q48.2 41.8 45 43.7Q41.8 45.7 38.3 46.9Q34.7 48 31.2 49.5Q27.7 50.9 24.6 50.5Q21.5 50.1 18.2 50Q14.9 50 13.2 48.4Q11.5 46.8 10.1 45.1Q8.7 43.4 7.8 41.4Q6.8 39.4 6.7 36.9Q6.6 34.4 9.3 31.9Q12 29.3 14.2 27Q16.5 24.6 19.2 22.2Q21.9 19.9 25.4 17.9Q28.9 16 32.6 15.5Q36.4 14.9 39.7 15Q43.1 15 46.7 14.9Q50.4 14.7 51.4 17Q52.4 19.3 54.3 20.8Z" fill="url(#mh-mango)" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <g stroke="#c4600f" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6">
        <path d="M14 41c9-3 20-9 34-19M17 46c9-3 18-8 28-15M16 34c7-3 15-8 23-14" />
      </g>
      <path d="M17 26c4-4 10-7 16-8" stroke="#fff3c4" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

/** A small amber honey jar with a lid and a drip */
export function HoneyJarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <linearGradient id="mh-honey" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6bb3c" />
          <stop offset="1" stopColor="#c46a14" />
        </linearGradient>
        <linearGradient id="mh-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8723f" />
          <stop offset="1" stopColor="#7a4a22" />
        </linearGradient>
      </defs>
      <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round">
        <path d="M17 22c-5 4-7 10-7 17 0 11 9 19 22 19s22-8 22-19c0-7-2-13-7-17Z" fill="url(#mh-honey)" />
        <rect x="14" y="10" width="36" height="12" rx="4" fill="url(#mh-lid)" />
        <path d="M14 18h36v3c0 2-2 3-4 3-2 0-3 4-5 4s-2-3-4-3-3 6-5 6-2-6-4-6-3 3-5 3-2-4-4-4H18c-2 0-4-1-4-3Z" fill="#f2a62a" />
      </g>
      <rect x="21" y="35" width="22" height="12" rx="3" fill="#fdf1d2" stroke={OUTLINE} strokeWidth="1.4" />
      <path d="M26 41h12" stroke="#c46a14" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 34c0-3 1-5 3-7" stroke="#fde6a6" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

/** A sprout: two veined leaves on a thin stem, growing from a small mound of soil */
export function SproutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <defs>
        <linearGradient id="mh-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9ccf4e" />
          <stop offset="1" stopColor="#4f8a2a" />
        </linearGradient>
        <linearGradient id="mh-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a6a42" />
          <stop offset="1" stopColor="#6b4325" />
        </linearGradient>
      </defs>
      <path d="M32 50c0-8 0-15 1-24" stroke={OUTLINE} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M32 50c0-8 0-15 1-24" stroke="#7bb33d" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" fill="url(#mh-leaf)">
        <path d="M31 30C25 16 13 12 5 16c4 11 15 17 26 14Z" />
        <path d="M34 26C39 11 51 6 60 9c-3 12-14 19-26 17Z" />
      </g>
      <g stroke={OUTLINE} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55">
        <path d="M29 28C22 23 15 19 9 17M20 22l-1 4M15 19l0 4" />
        <path d="M36 24c6-5 13-10 21-13M45 17l1 4M51 13l1 4" />
      </g>
      <path d="M10 56c3-8 12-12 22-12s19 4 22 12Z" fill="url(#mh-soil)" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 51c3-3 7-4 11-4" stroke="#c99a6c" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M41 18c3-4 8-6 12-7" stroke="#e3f5c2" strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  )
}
