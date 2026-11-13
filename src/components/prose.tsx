import type { ReactNode } from "react";
import { Notice } from "./ui";

/** Long-form content page (about, safety, legal). */
export function ProsePage({ title, intro, draft, children }: { title: string; intro?: string; draft?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <h1 className="text-4xl text-charcoal sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-ink-700">{intro}</p>}
      {draft && (
        <Notice tone="peach" className="mt-6">
          <strong>Draft for review.</strong> This page is a plain-English working draft prepared during development. It must be reviewed by a qualified legal adviser before BELONG launches.
        </Notice>
      )}
      <div className="mt-8 space-y-8 text-ink-700 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:text-charcoal [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1.5">{children}</div>
    </div>
  );
}
