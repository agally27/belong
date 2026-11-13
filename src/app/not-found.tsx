import { LinkButton, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="wash flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo />
      <span aria-hidden className="blob mt-10 block h-24 w-24 bg-gradient-to-br from-lavender-200 to-sage-200" />
      <h1 className="mt-8 text-4xl text-charcoal">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-md text-ink-500">It may have moved, or it may not be yours to see. Either way, let&apos;s get you somewhere friendlier.</p>
      <LinkButton href="/" className="mt-7">
        Take me home
      </LinkButton>
    </main>
  );
}
