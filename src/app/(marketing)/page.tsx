import { Check, HeartHandshake, Lock, MessageCircleHeart, Sparkles, Timer, Users } from "lucide-react";
import { Avatar, Badge, Card, CompanionOrb, LinkButton, Meter, Notice } from "@/components/ui";
import { formatPrice } from "@/lib/config";
import { listPlans } from "@/lib/services/subscriptions";

export const dynamic = "force-dynamic";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const plans = await listPlans();
  const { deleted } = await searchParams;
  return (
    <>
      {deleted && (
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <Notice tone="sage">Your account and everything attached to it have been permanently deleted. Take care of yourself.</Notice>
        </div>
      )}

      {/* Hero */}
      <section className="wash relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <Badge tone="lavender" className="mb-5 px-3 py-1">
              <Sparkles size={13} /> A new kind of introduction
            </Badge>
            <h1 className="text-5xl text-charcoal sm:text-6xl lg:text-7xl">
              Your people are <em className="text-lavender-600">out there.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-700">
              BELONG gives you a personal AI companion that gets to know what matters to you, then quietly looks for people you&apos;d genuinely get along with. No feeds. No swiping. Just the right introduction, when you both say yes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/register" size="lg">
                Meet your companion
              </LinkButton>
              <LinkButton href="/#how" variant="outline" size="lg">
                See how it works
              </LinkButton>
            </div>
            <p className="mt-5 text-sm text-ink-500">Free to join · For adults 18+ · You control everything that&apos;s shared</p>
          </div>

          {/* Illustrative product moment */}
          <div className="relative mx-auto w-full max-w-md" aria-label="An illustration of how a BELONG introduction looks">
            <span aria-hidden className="blob animate-drift absolute -left-10 -top-8 h-40 w-40 bg-sage-200/70" />
            <span aria-hidden className="blob-2 animate-drift absolute -bottom-10 -right-6 h-48 w-48 bg-sky-200/70" style={{ animationDelay: "-5s" }} />
            <Card className="relative animate-rise shadow-lift" style={{ animationDelay: "0.1s" }}>
              <div className="flex items-start gap-3">
                <CompanionOrb size={40} animate />
                <div className="rounded-2xl rounded-tl-sm bg-lavender-50 px-4 py-3 text-[0.95rem] text-ink-700">
                  I noticed someone nearby who&apos;s also hoping for hiking company this weekend. You both love photography too. Would you like an introduction?
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-sand/70 bg-ivory p-4">
                <div className="flex items-center gap-3">
                  <Avatar name="P" hue={150} size={46} />
                  <div>
                    <p className="font-medium text-charcoal">Priya · Bedminster</p>
                    <p className="text-xs text-ink-500">Illustrative example</p>
                  </div>
                  <Badge tone="sage" className="ml-auto">
                    Strong fit
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2.5">
                  <Meter label="Shared interests" value={0.82} tone="lavender" />
                  <Meter label="Shared moments" value={0.74} tone="sky" />
                  <Meter label="Complementary" value={0.46} tone="sage" />
                </div>
                <div className="mt-4 flex gap-2">
                  <span className="flex-1 rounded-full bg-charcoal py-2 text-center text-sm font-medium text-ivory">Yes, introduce us</span>
                  <span className="rounded-full border border-sand px-4 py-2 text-sm text-ink-700">Not now</span>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                <Lock size={12} /> Nothing happens unless you both approve.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Principle */}
      <section className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-20">
        <p className="font-display text-3xl leading-snug text-charcoal sm:text-4xl">
          &ldquo;AI should bring people closer together, <span className="text-sage-600">not replace human relationships.</span>&rdquo;
        </p>
        <p className="mx-auto mt-5 max-w-2xl text-ink-500">
          That&apos;s the idea BELONG is built on. Your companion isn&apos;t the friend — it&apos;s the thoughtful mutual acquaintance who says, &ldquo;You two should really meet.&rdquo;
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-cream/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-xl text-4xl text-charcoal">From a quiet conversation to a real connection</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: MessageCircleHeart, n: "01", t: "Meet your companion", d: "Chat about what you love, what you're curious about, and what you'd like company for. It remembers only what you approve." },
              { icon: Sparkles, n: "02", t: "It shares simple signals", d: "Your companion turns approved details into generalised signals — “hiking”, not your words — and joins the network on your behalf." },
              { icon: Users, n: "03", t: "The network notices a fit", d: "Companions compare signals across three dimensions: shared interests, shared moments, and complementary strengths." },
              { icon: HeartHandshake, n: "04", t: "You both say yes", d: "You see why you might get along. If you both approve, you're introduced and can message, meet, or join a Circle." },
            ].map((s) => (
              <Card key={s.n} className="relative">
                <span className="font-display text-sm text-lavender-500">{s.n}</span>
                <s.icon className="mt-3 text-lavender-600" size={26} strokeWidth={1.6} />
                <h3 className="mt-4 text-xl text-charcoal">{s.t}</h3>
                <p className="mt-2 text-sm text-ink-500">{s.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Live Connection Intelligence */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge tone="sky" className="mb-4 px-3 py-1">
              <Timer size={13} /> Live Connection Intelligence
            </Badge>
            <h2 className="text-4xl text-charcoal">Because friendship is often about timing</h2>
            <p className="mt-4 text-ink-700">
              Most platforms match who you are on paper. BELONG also notices what you&apos;re hoping for <em>right now</em> — a walk this Sunday, a board game night, a collaborator for an idea — and finds the people in the same moment.
            </p>
            <ul className="mt-6 space-y-3 text-ink-700">
              {[
                ["Shared interests", "The lasting things you both love.", "bg-lavender-300"],
                ["Shared moments", "What you're both hoping for this week. These signals expire on their own.", "bg-sky-300"],
                ["Complementary interests", "A guitarist and a learner. A writer and an illustrator.", "bg-sage-300"],
              ].map(([t, d, c]) => (
                <li key={t} className="flex gap-3">
                  <span className={`blob mt-1.5 h-3.5 w-3.5 shrink-0 ${c}`} />
                  <span>
                    <strong className="font-medium text-charcoal">{t}.</strong> {d}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-3xl bg-gradient-to-br from-lavender-100 via-ivory to-sky-100 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Illustrative · this week near you</p>
            <div className="mt-4 space-y-3">
              {[
                ["Hiking company this weekend", "4 companions noticing this", "sky"],
                ["Board game night", "3 companions noticing this", "lavender"],
                ["A collaborator for a zine", "2 companions noticing this", "sage"],
              ].map(([t, d, tone]) => (
                <div key={t} className="flex items-center justify-between gap-3 rounded-2xl bg-paper/90 px-4 py-3.5 shadow-soft">
                  <div>
                    <p className="font-medium text-charcoal">{t}</p>
                    <p className="text-xs text-ink-500">{d} — never who, until you both agree</p>
                  </div>
                  <Badge tone={tone as "sky"}>Live</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 bg-charcoal py-16 text-ivory sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-2xl text-4xl text-ivory">Private by design, not by promise</h2>
          <p className="mt-4 max-w-2xl text-ink-300">Your companion keeps your confidence. The network only ever sees the signals you approve.</p>
          <div className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Your conversations stay yours", "No other member — and no other companion — can read what you tell yours."],
              ["You approve every memory", "Your companion suggests what to remember. Nothing is kept until you say so, and you can edit or delete it any time."],
              ["Signals, never your words", "The network compares generalised topics. Your sentences never leave your account."],
              ["Mutual approval, always", "No one can message you without an introduction you have both accepted."],
              ["General areas only", "BELONG uses the neighbourhood you type in. It never tracks your location."],
              ["Leave with everything, or nothing", "Export all your data, or delete your account permanently, in two clicks."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <Check className="mt-1 shrink-0 text-sage-300" size={18} />
                <div>
                  <h3 className="text-lg text-ivory">{t}</h3>
                  <p className="mt-1 text-sm text-ink-300">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Circles */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
              <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-lavender-300" />
              <span aria-hidden className="absolute inset-10 rounded-full bg-sage-100" />
              <p className="relative text-center font-display text-xl text-sage-700">
                Sunday
                <br />
                Walkers
              </p>
              {[205, 150, 262, 130, 28, 350].map((hue, i) => {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                return (
                  <span key={hue} className="absolute" style={{ left: `calc(50% + ${Math.cos(a) * 128}px - 24px)`, top: `calc(50% + ${Math.sin(a) * 128}px - 24px)` }}>
                    <Avatar name={"DPAJTE"[i]} hue={hue} size={48} />
                  </span>
                );
              })}
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Badge tone="sage" className="mb-4 px-3 py-1">
              BELONG Circles
            </Badge>
            <h2 className="text-4xl text-charcoal">Small groups, where friendships actually form</h2>
            <p className="mt-4 text-ink-700">
              Circles bring together four to eight people around something they share — a Sunday walk, a supper club, a writers&apos; table. Small enough that everyone is noticed. Regular enough that acquaintances become friends.
            </p>
            <LinkButton href="/register" variant="sage" className="mt-6">
              Find your Circle
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="bg-cream/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-4xl text-charcoal">Start free. Stay because it works.</h2>
            <LinkButton href="/pricing" variant="outline">
              Compare memberships
            </LinkButton>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.id} className={p.id === "plus" ? "border-lavender-300 ring-2 ring-lavender-100" : ""}>
                <h3 className="text-xl text-charcoal">{p.name}</h3>
                <p className="mt-2 font-display text-3xl text-charcoal">
                  {formatPrice(p.pricePence, p.currency)}
                  {p.pricePence > 0 && <span className="font-sans text-sm text-ink-500"> / {p.interval}</span>}
                </p>
                <p className="mt-2 text-sm text-ink-500">{p.tagline}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="wash">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <CompanionOrb size={64} animate className="mx-auto" />
          <h2 className="mt-6 text-4xl text-charcoal sm:text-5xl">Somewhere nearby, someone is hoping to meet a person just like you.</h2>
          <LinkButton href="/register" size="lg" className="mt-8">
            Join BELONG
          </LinkButton>
        </div>
      </section>
    </>
  );
}
