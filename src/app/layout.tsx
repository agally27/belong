import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BELONG — Your people are out there.", template: "%s · BELONG" },
  description:
    "BELONG gives you a personal AI companion that gets to know you and quietly looks for people you'd genuinely get along with. Real friendships, with you in control.",
  applicationName: "BELONG",
};

export const viewport: Viewport = {
  themeColor: "#fbf8f1",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so it receives this request's CSP nonce (see src/proxy.ts).
  await connection();
  return (
    <html lang="en-GB">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-charcoal focus:px-4 focus:py-2 focus:text-ivory">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
