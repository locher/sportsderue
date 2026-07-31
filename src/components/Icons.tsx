interface IconProps {
  className?: string
}

const base = 'size-5 shrink-0'

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? base}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function LocateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6" />
    </Svg>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Svg>
  )
}

export function WalkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M11 21l1.6-5.2M14.6 9l-3.4 1.6L9 15m5.6-6 2.2 3.2 2.4.8M12.6 15.8 15 21" />
    </Svg>
  )
}

export function BulbIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.7V16h5v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
    </Svg>
  )
}

export function AccessibleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="4.2" r="1.8" />
      <path d="M9 8h5.5M10.5 8v5h4.2l2.3 6M10.5 13a4.6 4.6 0 1 0 4.4 6" />
    </Svg>
  )
}

export function TreeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21v-4" />
      <path d="M12 3 6.5 12h11L12 3Z" />
      <path d="M8 17h8l-4-5-4 5Z" />
    </Svg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  )
}

export function RouteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <path d="M8.6 18h5a3.4 3.4 0 0 0 0-6.8h-3a3.4 3.4 0 0 1 0-6.8h4.8" />
    </Svg>
  )
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" />
      <path d="M5 13v6.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V13" />
    </Svg>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </Svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  )
}

export function RulerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 14.5 14.5 3.5l6 6-11 11-6-6Z" />
      <path d="m7 11 2 2m2-5 2 2m2-5 2 2" />
    </Svg>
  )
}

export function Spinner({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'size-5 animate-spin'}
      aria-hidden="true"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
