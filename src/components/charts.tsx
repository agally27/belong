/**
 * Small server-rendered charts for the admin console.
 * Rules followed: one measure per chart (never dual axes), a single hue for a
 * single series (so no legend is needed — the title names it), thin marks with
 * rounded data-ends, recessive axes, labels in ink rather than series colour,
 * a hover tooltip on every mark, and a table view of the same numbers.
 */
type Point = { day: string; n: number };

const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function ColumnChart({ title, data, unit }: { title: string; data: Point[]; unit: string }) {
  const W = 560;
  const H = 180;
  const pad = { l: 28, r: 6, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.n));
  const top = Math.ceil(max / 2) * 2 || 2;
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(22, slot - 2);
  const y = (n: number) => pad.t + (H - pad.t - pad.b) * (1 - n / top);
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <figure className="rounded-2xl border border-sand/70 bg-paper p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg text-charcoal">{title}</span>
        <span className="text-sm text-ink-500">
          <span className="font-medium tabular-nums text-charcoal">{total}</span> in {data.length} days
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`${title}: ${total} ${unit} over the last ${data.length} days. A table of the daily values follows.`}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e8dfcc" strokeWidth="1" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#736c65">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const h = Math.max(d.n ? 3 : 0, y(0) - y(d.n));
          return (
            <g key={d.day} className="group">
              {/* Hit target is the whole column, larger than the mark. */}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent">
                <title>{`${shortDay(d.day)}: ${d.n} ${unit}`}</title>
              </rect>
              {d.n > 0 && <path d={`M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} className="fill-lavender-500 transition-colors group-hover:fill-lavender-700" pointerEvents="none" />}
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="#736c65">
                  {shortDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-ink-500">View as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium capitalize">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-sand/50">
                <td className="py-1 text-ink-700">{shortDay(d.day)}</td>
                <td className="py-1 text-right tabular-nums text-charcoal">{d.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars with direct value labels; doubles as its own table. */
export function BarList({ title, data, note, showShare }: { title: string; data: { label: string; n: number }[]; note?: string; showShare?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const first = data[0]?.n || 1;
  return (
    <figure className="rounded-2xl border border-sand/70 bg-paper p-5">
      <figcaption className="font-display text-lg text-charcoal">{title}</figcaption>
      {note && <p className="mt-0.5 text-xs text-ink-500">{note}</p>}
      {data.length ? (
        <ul className="mt-4 space-y-3">
          {data.map((d) => (
            <li key={d.label} title={`${d.label}: ${d.n}`}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="capitalize text-ink-700">{d.label}</span>
                <span className="tabular-nums text-charcoal">
                  {d.n}
                  {showShare && <span className="ml-1.5 text-xs text-ink-500">{Math.round((d.n / first) * 100)}%</span>}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-cream">
                <div className="h-full rounded-full bg-lavender-500" style={{ width: `${(d.n / max) * 100}%`, minWidth: d.n ? 6 : 0 }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-500">No data yet.</p>
      )}
    </figure>
  );
}
