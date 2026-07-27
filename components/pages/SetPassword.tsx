"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { postAuthDest } from "@/lib/auth";
import { isSmallScreen } from "@/lib/viewport";
import { Icon } from "@/components/ui/Icon";

export function SetPassword() {
  const router = useRouter();
  const setPassword = useStore((s) => s.setPassword);

  // The one-time key rides in on the emailed link (?key=…). Read it after mount so the
  // server and first client render agree (window doesn't exist during prerender).
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setKey(new URLSearchParams(window.location.search).get("key"));
    setReady(true);
  }, []);
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
      // Frappe returns 410 with a "reset password link…" message when the key is
      // used/expired; match those phrases specifically (not a generic 404 "Not Found").
      // Password-policy failures surface their own message, which we pass through.
      const msg = err instanceof Error ? err.message : "";
      const dead = /reset password link|expired|used before/i.test(msg);
      setDeadLink(dead);
      setError(
        dead
          ? "This link is expired or already used. If you've already set a password, just sign in — otherwise ask your administrator to resend the invite."
          : msg || "Couldn't set your password — please try again.",
      );
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
          <h2>Set your password</h2>
          <div className="sub">Choose a password to activate your Inventive Helpdesk account.</div>

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
