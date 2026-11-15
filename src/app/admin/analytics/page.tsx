import type { Metadata } from "next";
import { PrivacyNote } from "@/components/admin-ui";
import { BarList, ColumnChart } from "@/components/charts";
import { PageHeader, Stat } from "@/components/ui";
import { analytics, overview } from "@/lib/services/admin";
import { feedbackSummary } from "@/lib/services/feedback";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage() {
  const admin = await requireAdmin();
  const [a, o] = [await analytics(admin.id), await overview(admin.id)];
  const fb = await feedbackSummary();
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Insight" title="Analytics" description="First-party, aggregate counts for the last 14 days. No third-party trackers, and no message or memory content." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Introduction approval" value={a.introApprovalRate === null ? "—" : `${a.introApprovalRate}%`} hint="of decided introductions" />
        <Stat label="Connections" value={o.connections} hint="active" />
        <Stat label="Members sharing signals" value={a.funnel[2].n} hint={`of ${a.funnel[0].n} members`} />
        <Stat label="Live signals" value={o.liveSignals} hint="temporary, right now" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <ColumnChart title="New members" data={a.signups} unit="sign-ups" />
        <ColumnChart title="New connections" data={a.connections} unit="connections" />
        <ColumnChart title="Messages between members" data={a.messages} unit="messages" />
        <ColumnChart title="Messages to companions" data={a.companionMessages} unit="messages" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <BarList title="Member journey" note="How far members have progressed. Percentages are of everyone who joined." data={a.funnel} showShare />
        <BarList title="Introductions by outcome" data={a.introsByStatus} />
      </div>
      <BarList
        title="How meetings went"
        note={`Private “How did it go?” answers, counted only. ${fb.met ? `${Math.round((fb.great / fb.met) * 100)}% of members who met said it was great.` : "No answers yet."}`}
        data={[
          { label: "Great", n: fb.great },
          { label: "OK", n: fb.ok },
          { label: "Not for me", n: fb.notForMe },
          { label: "Not met yet", n: fb.notYet },
          { label: "Won't be meeting", n: fb.didNotMeet },
        ]}
      />
      <PrivacyNote />
    </div>
  );
}
