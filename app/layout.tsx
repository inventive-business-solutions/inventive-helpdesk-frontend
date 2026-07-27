import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  // Per-route pages set their own title; this template frames it (e.g. "Tickets · Inventive Helpdesk").
  title: { default: "Inventive Helpdesk", template: "%s · Inventive Helpdesk" },
  description: "After-sales support & ticketing for Inventive Business Solutions.",
  // Internal, cookie-gated tool — keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {/* Desktop-only, by product decision: below 900px the app is replaced by this
            panel rather than reflowed. Deliberately CSS-only and rendered on every
            request — a JS width check would need the client to boot before it could
            decide, so the unsupported layout would paint first and then be replaced,
            and it would have nothing to say if the app bundle failed. This has no such
            window: the media query resolves on first paint, before any script runs.

            It sits outside ToastProvider so it does not depend on the client tree at all.
            `aria-hidden` is unnecessary in either direction — whichever side is inactive
            is `display: none`, which takes it out of the accessibility tree too. */}
        <div className="viewport-gate">
          <div className="viewport-gate-card">
            <span className="brand-glyph">
              <Icon name="logo" size={20} />
            </span>
            <h1>Inventive Helpdesk needs a bigger screen</h1>
            <p>
              This is a desk tool — ticket queues, side-by-side detail panes and dense tables — and it is
              built for a laptop or desktop display. On a phone or a tablet held upright there is not enough
              width to show it honestly.
            </p>
            <p className="viewport-gate-lead">If you only have this device to hand:</p>
            <ul className="viewport-gate-steps">
              <li>
                <b>Chrome / Android</b> — tap <span className="viewport-gate-key">⋮</span> and turn on
                <b> Desktop site</b>.
              </li>
              <li>
                <b>Safari / iPhone &amp; iPad</b> — tap <span className="viewport-gate-key">AA</span> in the
                address bar, then <b>Request Desktop Website</b>.
              </li>
            </ul>
            <p className="viewport-gate-note">
              Rotating a tablet to landscape usually works too. Otherwise, please come back on a computer.
            </p>
            <div className="viewport-gate-foot">© 2026 Inventive Business Solutions Pvt Ltd</div>
          </div>
        </div>
        <ToastProvider>
          <div className="app-root">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
