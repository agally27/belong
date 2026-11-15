"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[belong:ui]", error);
  }, [error]);
  return (
    <main id="main" className="wash flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <span aria-hidden className="blob block h-20 w-20 bg-gradient-to-br from-peach-200 to-lavender-200" />
      <h1 className="mt-8 text-4xl text-charcoal">Something went wrong</h1>
      <p className="mt-3 max-w-md text-ink-500">That&apos;s on us, not you. Please try again — and if it keeps happening, let us know through Help.</p>
      {error.digest && <p className="mt-2 text-xs text-ink-500">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-7 rounded-full bg-charcoal px-6 py-2.5 font-medium text-ivory hover:bg-ink-700">
        Try again
      </button>
    </main>
  );
}
