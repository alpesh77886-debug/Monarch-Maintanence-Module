// Loop 21: shared presentational stat-card, used by /dashboard and /kpi.
//
// Deliberately just a colour + layout wrapper around whatever number the
// caller already computed — it invents no data and no thresholds. "tone"
// is a purely visual hint the caller chooses (e.g. an existing warn/neutral
// decision already made in the page), never a judgement this component
// makes on its own. No "use client" here: it renders nothing interactive,
// so it stays a plain server component and can be called directly from any
// server page (the Loop 16 boundary-bug lesson: don't give a client-only
// file a second export a server component calls — this file simply isn't
// a client file at all).

const TONES = {
  neutral: "bg-bg2 text-muted",
  info: "bg-brand/10 text-sky-300",
  warn: "bg-warn/10 text-amber-300",
  danger: "bg-bad/10 text-red-300",
  success: "bg-good/10 text-emerald-300",
} as const;

export type StatCardTone = keyof typeof TONES;

// Minimal inline SVG glyphs — no icon package added just for this loop's
// visual-only scope (Loop 21 was explicitly scoped as presentation-only,
// not a dependency change).
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.6}>
      {children}
    </svg>
  );
}

export const Icons = {
  clipboard: (
    <Svg>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" />
      <path d="M7.5 3.5V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 3v.5" />
      <path d="M7 9h6M7 12.5h6" strokeLinecap="round" />
    </Svg>
  ),
  warning: (
    <Svg>
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" strokeLinejoin="round" />
      <path d="M10 8.5v3.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  clock: (
    <Svg>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" strokeLinecap="round" />
    </Svg>
  ),
  check: (
    <Svg>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.3l2 2 4-4.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  person: (
    <Svg>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
    </Svg>
  ),
};

export function StatCard({
  label,
  value,
  sublabel,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: StatCardTone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-card p-3">
      {icon && (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${TONES[tone]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-xl font-semibold text-fg">{value}</p>
        {sublabel && <p className="mt-0.5 text-xs text-muted2">{sublabel}</p>}
      </div>
    </div>
  );
}

// A single labelled horizontal bar for a share-of-total breakdown (e.g.
// case status distribution). `segments` must already sum to `total` by the
// caller's own arithmetic — this component does not recompute or validate
// business meaning, only renders proportional widths.
export function BarBreakdown({
  title,
  total,
  segments,
}: {
  title: string;
  total: number;
  segments: { label: string; value: number; colorClass: string }[];
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-bg2">
        {total > 0 &&
          segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                className={s.colorClass}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${s.value}`}
              />
            ) : null
          )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${s.colorClass}`} />
            {s.label}: {s.value}
          </span>
        ))}
      </div>
      {total === 0 && <p className="mt-1 text-xs text-muted2">No data yet.</p>}
    </div>
  );
}
