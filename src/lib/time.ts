/** UK time helpers. BELONG is UK-only; every member-facing time is Europe/London. */
/** A datetime-local value ("2026-07-04T10:00") is UK time; convert it to an ISO instant. */
export function londonToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local) || /Z|[+-]\d{2}:?\d{2}$/.test(local)) return local;
  const asUtc = new Date(`${local.slice(0, 16)}:00Z`);
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(asUtc));
  const offset = (londonHour - asUtc.getUTCHours() + 24) % 24; // 0 in winter, 1 in summer
  return new Date(asUtc.getTime() - offset * 3600000).toISOString();
}
