"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import * as api from "@/lib/frappe";
import { postAuthDest } from "@/lib/auth";
import { isSmallScreen } from "@/lib/viewport";
import { Icon } from "@/components/ui/Icon";

/** One sentence per way a link can be dead, because the right next step differs.
 *
 *  `expired` and `invalid` are separated on purpose: "ask for a new one" and "check you
 *  copied the whole link" are different instructions, and sending someone to their
 *  administrator when they simply truncated a URL wastes both their time. `revoked` never
 *  mentions the account state in a way a stranger could mine — it reads the same whether
 *  the reader is the account holder or not. */
const DEAD_LINK_MESSAGE: Record<api.PasswordLinkState, string> = {
  expired:
    "This link has expired. Links stay valid for a limited time — ask your administrator to send a fresh invite.",
  revoked: "This account no longer has access to the system. Please contact your administrator.",
  invalid:
    "This link has already been used, or it isn't complete. If you've already set a password, sign in — otherwise ask for a new invite.",
  valid: "",
};

export function SetPassword() {
  const router = useRouter();
  const setPassword = useStore((s) => s.setPassword);

  // The one-time key rides in on the emailed link (?key=…). Read it after mount so the
  // server and first client render agree (window doesn't exist during prerender).
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Where to send someone whose link is dead. Comes from the server rather than a literal
  // here, because the inbox is configurable per site (site_config `support_inbox`) and a
  // hardcoded address would be wrong on any site that set one.
  const [supportInbox, setSupportInbox] = useState<string | null>(null);

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  // One toggle drives both fields — revealing only one of a password/confirm pair is
  // the kind of half-state that makes people think the two don't match.
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A used/expired/missing link can't set a password — offer sign-in instead.
  const [deadLink, setDeadLink] = useState(false);
  // Set on a phone once the password is saved. This page is reachable below the desktop
  // cutoff on purpose (invites are opened wherever the email was read), but the app
  // behind it is not — so the account is activated and the journey stops here, with the
  // host captured for the instruction. Sending them onward would land them on the gate
  // one route later, which reads as "the invite didn't work".
  const [activatedHost, setActivatedHost] = useState<string | null>(null);

  // Check the link BEFORE offering the form. Without this the page renders every field, the
  // person chooses a password, types it twice, submits — and only then finds out the link
  // died. The answer is knowable on arrival, so it is asked for on arrival.
  //
  // The check does not consume the key: mail security products (Outlook Safe Links,
  // Defender ATP) fetch every URL in a message before the recipient sees it, and a check
  // that spent the key would leave scanned invites dead by the time a human opened them.
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    setKey(k);
    if (!k) {
      setReady(true);
      return;
    }
    // Guards a late response from a request whose page has already gone — setting state
    // after unmount, and worse, overwriting a fresher answer if the key ever changed.
    let live = true;
    void api
      .passwordLinkStatus(k)
      .then((r) => {
        if (!live) return;
        setSupportInbox(r.support_inbox || null);
        if (r.status !== "valid") {
          setDeadLink(true);
          setError(DEAD_LINK_MESSAGE[r.status] ?? DEAD_LINK_MESSAGE.invalid);
        }
      })
      // A failed pre-flight is not a verdict. The network may be down or the endpoint
      // unreachable — neither means the link is bad, and refusing the form on that basis
      // would strand someone holding a perfectly good invite. Fall through to the form; the
      // server checks again at redemption, which is the boundary that actually counts.
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!key) {
      setError(
        "This link is missing its security token. Open the invite email again, or ask for a fresh invite.",
      );
      return;
    }
    if (pwd.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (pwd !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await setPassword(key!, pwd);
      // Checked here, not during render: it reads the live viewport, which does not exist
      // on the server. Doing it in an event handler keeps the markup identical on both
      // sides of hydration.
      if (isSmallScreen()) {
        setActivatedHost(window.location.host);
        setSubmitting(false);
        return;
      }
      router.replace(postAuthDest(session.role));
    } catch (err) {
      // Reaching here with a dead link is now the rare path — the page checked on arrival
      // and would not have rendered this form. It still has to be handled, because the key
      // can die between that check and this submit: someone leaves the tab open past the
      // window, or an administrator revokes them while the page sits there.
      //
      // The patterns cover our own wording from set_password_with_key AND Frappe's, since
      // update_password can still refuse underneath us on a race. Anything else — a
      // password-policy rejection, a network failure — keeps its own message, because
      // telling someone their link is broken when their password was merely too weak sends
      // them to ask for an invite they do not need.
      const msg = err instanceof Error ? err.message : "";
      const dead =
        /link has expired|already been used|no longer has access|is not valid|reset password link|used before/i.test(
          msg,
        );
      setDeadLink(dead);
      setError(dead ? msg : msg || "Couldn't set your password — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <aside className="auth-brand">
        <div className="brand-mark">
          <span className="brand-glyph">
            <Icon name="logo" size={20} />
          </span>
          <span className="brand-name">
            Inventive <span>Helpdesk</span>
          </span>
        </div>
        <div className="auth-hero">
          <h1>Set your password to get started.</h1>
          <p>
            You&apos;re one step away. Choose a password to activate your account — you&apos;ll be signed in
            straight away and taken to your workspace.
          </p>
        </div>
        <div className="foot">© 2026 Inventive Business Solutions Pvt Ltd</div>
      </aside>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="brand-mark">
            <span className="brand-glyph">
              <Icon name="logo" size={20} />
            </span>
            <span className="brand-name">
              Inventive <span>Helpdesk</span>
            </span>
          </div>
          <div className="auth-head">
            <h2>Set your password</h2>
            <div className="sub">Choose a password to activate your Inventive Helpdesk account.</div>
          </div>

          {activatedHost ? (
            <div className="auth-form">
              <div className="auth-note" role="status">
                <Icon name="check" size={14} />
                <div>Your password is set and your account is now active.</div>
              </div>
              <p className="auth-done">
                Inventive Helpdesk itself is built for a laptop or desktop — a ticket queue needs more width
                than a phone has. Open <b>{activatedHost}</b> on a computer and sign in with the password you
                just chose.
              </p>
              <p className="auth-done-note">Nothing else to do here. You can close this page.</p>
            </div>
          ) : ready && (deadLink || !key) ? (
            <div className="auth-form">
              <div className="auth-note" style={{ color: "var(--critical)" }} role="alert">
                <Icon name="alert" size={14} />
                <div>
                  {error ||
                    "This link is missing its security token. Open the most recent invite email, or ask your administrator to resend it."}
                </div>
              </div>
              <button
                type="button"
                className="btn primary auth-submit"
                onClick={() => router.replace("/login")}
              >
                Go to sign in
              </button>
              {/* The way out. "Ask your administrator" is only useful to someone who knows
                  who that is and how to reach them — an invited client POC knows neither.
                  A mailto with the subject filled in is inert (no endpoint, nothing to
                  abuse) and turns the dead end into one tap.

                  Only rendered once the server has told us the address: it is configurable
                  per site, and a hardcoded fallback would quietly send mail to the wrong
                  inbox on any site that set its own. */}
              {supportInbox && (
                <p className="auth-done-note">
                  Can&apos;t reach your administrator?{" "}
                  <a
                    className="auth-mailto"
                    href={`mailto:${supportInbox}?subject=${encodeURIComponent(
                      "Inventive Helpdesk — my invite link has expired",
                    )}`}
                  >
                    Email {supportInbox}
                  </a>
                </p>
              )}
            </div>
          ) : (
            <div className="auth-form">
              <div className="auth-field">
                <label htmlFor="pwd">New password</label>
                <div className="auth-input">
                  <input
                    id="pwd"
                    type={reveal ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus
                    required
                    value={pwd}
                    placeholder="At least 8 characters"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "setpw-error" : undefined}
                    onChange={(e) => {
                      setPwd(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    className="auth-reveal"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                    aria-pressed={reveal}
                    tabIndex={-1}
                  >
                    <Icon name={reveal ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="confirm">Confirm password</label>
                <div className="auth-input">
                  <input
                    id="confirm"
                    type={reveal ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    placeholder="Re-enter your password"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "setpw-error" : undefined}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
              </div>

              <button type="submit" className="btn primary auth-submit" disabled={submitting}>
                {submitting && <span className="auth-spinner" aria-hidden="true" />}
                {submitting ? "Setting up…" : "Set password & sign in"}
              </button>

              {error && (
                <div id="setpw-error" className="auth-note" style={{ color: "var(--critical)" }} role="alert">
                  <Icon name="alert" size={14} />
                  <div>{error}</div>
                </div>
              )}
              <div className="auth-forgot-row">
                <button type="button" className="auth-forgot" onClick={() => router.replace("/login")}>
                  Already have a password? Sign in
                </button>
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
