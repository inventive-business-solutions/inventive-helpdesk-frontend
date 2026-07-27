"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { requestPasswordReset, isAccountDisabledError, PostAuthError } from "@/lib/frappe";
import { postAuthDest } from "@/lib/auth";
import { isEmail } from "@/lib/helpers";
import { Icon } from "@/components/ui/Icon";

type Mode = "signin" | "reset";

export function SignIn() {
  const router = useRouter();
  const signIn = useStore((s) => s.signIn);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Caps Lock is the single most common cause of "my password stopped working". The
  // browser only reports modifier state on a key event, so read it from the event
  // rather than tracking keydown/keyup ourselves.
  const readCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Don't clear the error here. Clearing it, then re-setting it after the async login
    // round-trip, makes the vertically-centered card flash shorter→taller on every click
    // — a visible bounce. The error is already cleared when the user edits a field.
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await signIn(email.trim(), password);
      router.replace(postAuthDest(session.role));
    } catch (err) {
      // Three genuinely different failures, and telling them apart is the whole point.
      //
      // A removed member/POC (disabled login) gets a clear "no access" message — but only
      // when they had the right password, so we never reveal disabled-status to a stranger
      // guessing (see Frappe auth).
      //
      // A PostAuthError means the password was ACCEPTED and something later failed: a
      // missing role, a permission gap, the backend going away mid-sequence. Telling that
      // person to check their password sends them to re-type the one thing that is
      // definitely correct — which is exactly what happened when an account reached the
      // login screen with no roles attached.
      //
      // Only a failure at the credentials step earns the credentials hint.
      setError(
        isAccountDisabledError(err)
          ? "This account no longer has access to the system. Please reach out to your administrator."
          : err instanceof PostAuthError
            ? err.message
            : "We couldn't sign you in. Check your email and password, then try again.",
      );
      setSubmitting(false);
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
    } catch {
      /* never reveal whether the address exists */
    }
    // Neutral confirmation regardless, to avoid account enumeration.
    setNotice("If that account exists, a password-reset email is on its way.");
    setSubmitting(false);
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
        {/* Written for BOTH readers. /login is one screen: agents and client POCs sign in
            through the same form and only split afterwards, on role. So the copy cannot use
            "client" for the reader — a POC would be talked about in the third person on the
            screen where they type their password — and it says "support requests" rather
            than "tickets", which is operations vocabulary a first-time client has not
            learned yet. "Ticket" stays inside the app, where it is a real object with an ID. */}
        <div className="auth-hero">
          <h1>Every request, one place.</h1>
          <p>Raise, track and resolve support requests — your team and ours, working from the same record.</p>
          {/* Numbered and ruled rather than ticked. A tick asserts a benefit; a number just
              indexes a list, which is the quieter claim and the one an internal tool can
              actually make. It also gives the three rows a left edge to line up on, which
              is what the tick version was missing. */}
          <ol className="brand-points">
            {/* Rows 01 and 02 are what the READER does, in the order they do it; 03 is what
                they get. The set they replaced described the product from Inventive's side of
                the desk — and one row, "internal notes stay internal", was a staff benefit
                that on a client-facing screen only advertises what is being withheld. */}
            <li className="brand-point">
              <span className="bp-n">01</span>
              <span className="bp-t">Raise a request in a minute</span>
            </li>
            <li className="brand-point">
              <span className="bp-n">02</span>
              <span className="bp-t">Follow its progress at any time</span>
            </li>
            <li className="brand-point">
              <span className="bp-n">03</span>
              <span className="bp-t">A clear trail from first report to resolved</span>
            </li>
          </ol>
        </div>
        <div className="foot">© 2026 Inventive Business Solutions Pvt Ltd</div>
      </aside>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={mode === "signin" ? submit : sendReset}>
          <div className="brand-mark">
            <span className="brand-glyph">
              <Icon name="logo" size={20} />
            </span>
            <span className="brand-name">
              Inventive <span>Helpdesk</span>
            </span>
          </div>
          {/* Keyed on the mode so switching to reset and back remounts this block and
              replays its entrance. Without the key React reuses the same DOM nodes and
              only swaps the text, so the copy teleports with nothing for CSS to react to.
              Scoped to the heading alone — keying the fields too would remount the inputs
              and throw away what had been typed into them. */}
          <div className="auth-head" key={mode}>
            <h2>{mode === "signin" ? "Sign in" : "Reset your password"}</h2>
            <div className="sub">
              {mode === "signin"
                ? "Sign in with your Inventive Helpdesk account."
                : "Enter your email and we'll send a reset link."}
            </div>
          </div>

          <div className="auth-form">
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                placeholder="you@company.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "auth-error" : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setNotice(null);
                }}
              />
            </div>

            {mode === "signin" && (
              <div className="auth-field">
                <label htmlFor="password">Password</label>
                <div className="auth-input">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    placeholder="Your password"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "auth-error" : undefined}
                    onKeyUp={readCapsLock}
                    onKeyDown={readCapsLock}
                    onBlur={() => setCapsLock(false)}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                  {/* tabIndex -1: tabbing should run label → field → submit. The toggle
                      is a mouse convenience, and keyboard users are not helped by an
                      extra stop between the password and the button. */}
                  <button
                    type="button"
                    className="auth-reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
                {capsLock && (
                  <p className="auth-hint">
                    <Icon name="alert" size={13} />
                    Caps Lock is on
                  </p>
                )}
              </div>
            )}

            <div className="auth-forgot-row">
              <button
                type="button"
                className="auth-forgot"
                onClick={() => {
                  setMode((m) => (m === "signin" ? "reset" : "signin"));
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === "signin" ? "Forgot password?" : "← Back to sign in"}
              </button>
            </div>

            <button type="submit" className="btn primary auth-submit" disabled={submitting}>
              {submitting && <span className="auth-spinner" aria-hidden="true" />}
              {submitting
                ? mode === "signin"
                  ? "Signing in…"
                  : "Sending…"
                : mode === "signin"
                  ? "Sign in"
                  : "Send reset link"}
            </button>

            {/* role="alert" / "status": announced the moment they appear. A purely
                visual message leaves a non-sighted user with a form that silently
                did nothing. */}
            {error && (
              <div id="auth-error" className="auth-note" style={{ color: "var(--critical)" }} role="alert">
                <Icon name="alert" size={14} />
                <div>{error}</div>
              </div>
            )}
            {notice && (
              <div className="auth-note" role="status">
                <Icon name="check" size={14} />
                <div>{notice}</div>
              </div>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
