export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading">
      <div className="h-9 w-64 rounded-xl bg-cream" />
      <div className="h-4 w-96 max-w-full rounded-lg bg-cream" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-2xl bg-cream/70" />
        <div className="h-40 rounded-2xl bg-cream/70" />
      </div>
      <div className="h-56 rounded-2xl bg-cream/50" />
    </div>
  );
}
