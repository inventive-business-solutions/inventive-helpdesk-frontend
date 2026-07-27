import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Wraps a route that the app refuses to render below `DESKTOP_MIN_WIDTH`, replacing it
 * with instructions for switching the browser into desktop mode.
 *
 * Applied per-route rather than in the root layout, and that placement is the point:
 * `/set-password` must stay reachable on a phone. Invite and reset emails both land
 * there (api.py `_set_password_link`), and those links are opened wherever the mail was
 * read — usually a phone. Gating it would make a working invite look broken, with no way
 * to activate the account at all.
 *
 * No "use client": this is markup and a media query. Rendering it on the server means the
 * decision is already made at first paint, so the unsupported layout never flashes, and a
 * visitor whose JS never boots still gets the explanation instead of a broken page.
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Whichever side is inactive is `display: none`, which removes it from the
          accessibility tree too — so neither needs aria-hidden. */}
      <div className="viewport-gate">
        <div className="viewport-gate-card">
          <span className="brand-glyph">
            <Icon name="logo" size={20} />
          </span>
          <h1>Inventive Helpdesk needs a bigger screen</h1>
          <p>
            This is a desk tool — ticket queues, side-by-side detail panes and dense tables — and it is built
            for a laptop or desktop display. On a phone or a tablet held upright there is not enough width to
            show it honestly.
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
      <div className="app-root">{children}</div>
    </>
  );
}
