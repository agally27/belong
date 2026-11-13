export const FAQ: [string, string][] = [
  ["Is my companion a real person?", "No. Your companion is an AI, and it will always tell you so. Its job is to understand what matters to you and help you find real people — not to be a replacement for them."],
  ["Who can see what I tell my companion?", "Only you. Other members, other companions and BELONG administrators cannot read your companion conversation or your memories."],
  ["What exactly is shared with other people?", "Only generalised signals you have approved — for example “hiking” or “looking for board game company this week”. You can see and switch off every one of them in Privacy & consent."],
  ["How do introductions work?", "When two members' signals fit, both are shown why. If one asks for an introduction, the other is asked too. Only if both say yes are you connected and able to message each other."],
  ["What happens if I decline an introduction?", "Nothing. The other person is told gently that it didn't go ahead this time, with no reason given, and you won't be suggested to each other again."],
  ["What are Circles?", "Small groups of four to eight people built around a shared interest, with their own group conversation and events."],
  ["How do I block or report someone?", "Open their profile or your conversation and choose Block or Report. Blocking is instant and silent. Reports are reviewed by a person, and the member is never told who reported them."],
  ["Can I download or delete my data?", "Yes. In Settings → Privacy & consent you can export everything BELONG holds about you, or delete your account permanently."],
  ["Does BELONG know where I am?", "No. BELONG never accesses your device's location. It only uses the area name you type into your profile."],
];

export function FaqList() {
  return (
    <div className="divide-y divide-sand/70 rounded-2xl border border-sand/70 bg-paper">
      {FAQ.map(([q, a]) => (
        <details key={q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-charcoal [&::-webkit-details-marker]:hidden">
            {q}
            <span aria-hidden className="text-xl text-lavender-500 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-2 text-sm text-ink-500">{a}</p>
        </details>
      ))}
    </div>
  );
}
