import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { getGraph, type GraphNode } from "@/lib/services/account";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Connection Graph" };

const W = 720;
const H = 520;

/** Deterministic radial layout: you in the middle, people on an inner ring, Circles on an outer ring. */
function layout(nodes: GraphNode[]) {
  const pos = new Map<string, { x: number; y: number }>();
  pos.set("me", { x: W / 2, y: H / 2 });
  const people = nodes.filter((n) => n.kind === "person");
  const circles = nodes.filter((n) => n.kind === "circle");
  people.forEach((n, i) => {
    const a = (i / Math.max(people.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: W / 2 + Math.cos(a) * 150, y: H / 2 + Math.sin(a) * 130 });
  });
  circles.forEach((n, i) => {
    const a = ((i + 0.5) / Math.max(circles.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: W / 2 + Math.cos(a) * 285, y: H / 2 + Math.sin(a) * 205 });
  });
  return pos;
}

export default async function GraphPage() {
  const user = await requireMember();
  const graph = await getGraph(user.id);
  if (!graph) notFound();
  const pos = layout(graph.nodes);
  const hasAny = graph.nodes.length > 1;
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Connection Graph" title="Your constellation" description="A picture of the relationships you've built through BELONG — you, the people you've connected with, and the Circles you share. Only you can see it." />
      {hasAny ? (
        <>
          <Card className="overflow-hidden !p-2 sm:!p-4">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="graph-title graph-desc" className="h-auto w-full">
              <title id="graph-title">Your connection graph</title>
              <desc id="graph-desc">
                You are connected to {graph.nodes.filter((n) => n.kind === "person").length} people and {graph.nodes.filter((n) => n.kind === "circle").length} Circles. The same information is listed below the diagram.
              </desc>
              <defs>
                <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#d8ceec" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#d8ceec" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={W / 2} cy={H / 2} r="230" fill="url(#glow)" />
              {graph.edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const fromMe = e.from === "me";
                return (
                  <g key={i}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={fromMe ? "#bdaede" : "#c9d8c0"} strokeWidth={fromMe ? 2 : 1.5} strokeDasharray={fromMe ? undefined : "4 5"} />
                    {fromMe && e.label && (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="11" fill="#736c65" paintOrder="stroke" stroke="#fffdf8" strokeWidth="4">
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {graph.nodes.map((n) => {
                const p = pos.get(n.id)!;
                const r = n.kind === "me" ? 34 : n.kind === "circle" ? 26 : 24;
                const fill = n.kind === "circle" ? "#e3ecde" : `hsl(${n.hue} 42% ${n.kind === "me" ? 58 : 68}%)`;
                const body = (
                  <g>
                    <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={n.kind === "circle" ? "#6b8a5f" : "#fffdf8"} strokeWidth={n.kind === "circle" ? 1.5 : 3} strokeDasharray={n.kind === "circle" ? "3 4" : undefined} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={n.kind === "me" ? 15 : 14} fontWeight="600" fill={n.kind === "circle" ? "#435a3a" : "#fff"}>
                      {n.kind === "me" ? "You" : n.kind === "circle" ? "◌" : n.label.charAt(0)}
                    </text>
                    {n.kind !== "me" && (
                      <text x={p.x} y={p.y + r + 16} textAnchor="middle" fontSize="12.5" fill="#2e2a27" paintOrder="stroke" stroke="#fffdf8" strokeWidth="4">
                        {n.label}
                      </text>
                    )}
                  </g>
                );
                return n.href && n.kind !== "me" ? (
                  <a key={n.id} href={n.href} aria-label={`${n.label}${n.kind === "circle" ? " (Circle)" : ""}`}>
                    {body}
                  </a>
                ) : (
                  <g key={n.id}>{body}</g>
                );
              })}
            </svg>
            <p className="flex flex-wrap justify-center gap-x-5 gap-y-1 pb-2 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-lavender-400" /> People
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-sage-600 bg-sage-100" /> Circles
              </span>
              <span>Dashed lines: a connection who shares that Circle</span>
            </p>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>What connects you</SectionTitle>
              {graph.topTopics.length ? (
                <ul className="space-y-2.5">
                  {graph.topTopics.map((t) => (
                    <li key={t.topic}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="capitalize text-ink-700">{t.label}</span>
                        <span className="tabular-nums text-ink-500">{t.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-cream">
                        <div className="h-full rounded-full bg-lavender-400" style={{ width: `${(t.count / graph.topTopics[0].count) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">Shared topics will appear as you connect.</p>
              )}
            </Card>
            <Card>
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <Sparkles size={18} className="text-lavender-500" /> Insights
                </span>
              </SectionTitle>
              {graph.insights ? (
                <ul className="space-y-2.5 text-ink-700">
                  {graph.insights.map((i) => (
                    <li key={i} className="rounded-xl bg-ivory px-4 py-3 text-sm">
                      {i}
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <p className="text-sm text-ink-500">Graph insights — the threads running through your connections, and gentle ideas for strengthening them — are part of BELONG Premium.</p>
                  <LinkButton href="/membership" variant="soft" size="sm" className="mt-4">
                    See memberships
                  </LinkButton>
                </div>
              )}
            </Card>
          </div>

          <section aria-label="Graph as a list">
            <SectionTitle>In words</SectionTitle>
            <ul className="grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
              {graph.edges
                .filter((e) => e.from === "me")
                .map((e) => {
                  const n = graph.nodes.find((x) => x.id === e.to)!;
                  return (
                    <li key={e.to} className="rounded-xl border border-sand/70 bg-paper px-4 py-2.5">
                      {n.href ? (
                        <Link href={n.href} className="font-medium text-charcoal hover:text-lavender-600">
                          {n.label}
                        </Link>
                      ) : (
                        <span className="font-medium">{n.label}</span>
                      )}{" "}
                      <span className="text-ink-500">
                        · {n.kind === "circle" ? "Circle" : "connection"}
                        {e.label && ` · ${e.label}`}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      ) : (
        <EmptyState title="Your graph starts with one connection" body="As you meet people and join Circles, they'll appear here as your own small constellation." action={<LinkButton href="/discover">Go to Discover</LinkButton>} />
      )}
    </div>
  );
}
