/**
 * The desktop-only cutoff, in one place because it is enforced in two languages.
 *
 * `app/globals.css` cannot import this, so the number is written there too — and
 * tests/viewport-gate.test.ts asserts the two agree rather than trusting anyone to
 * remember. The stylesheet is the enforcement; this is what the few JS decisions that
 * depend on the same threshold read, so they cannot disagree with what the user sees.
 */

/**
 * Narrower than this and the app is replaced by the "use a computer" panel.
 *
 * Deliberately below 980. A phone laying out under `width=device-width` reports ~390-430
 * and an upright tablet 768-834, but a browser told to "Request desktop site" ignores
 * width=device-width and lays out at roughly 980 — which is precisely what the panel
 * instructs people to do. A cutoff at or above 980 would re-block the screen its own
 * advice produced, with nothing left to try.
 */
export const DESKTOP_MIN_WIDTH = 900;

/**
 * Matches the viewports the gate covers. The 0.02 closes the gap at fractional zoom
 * levels, where a viewport can report 899.5 and satisfy neither `max-width: 899` nor
 * `min-width: 900`.
 */
export const SMALL_SCREEN_QUERY = `(max-width: ${DESKTOP_MIN_WIDTH - 0.02}px)`;

/**
 * Whether this device is one the app refuses to render on.
 *
 * Call it from an event handler, never during render: it reads the live viewport, which
 * does not exist on the server, so using it to choose markup would produce a hydration
 * mismatch. The gate itself is CSS precisely to avoid that; this exists only for the
 * places where a *decision* differs on a phone, such as declining to send someone into an
 * app they cannot reach.
 */
export function isSmallScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia(SMALL_SCREEN_QUERY).matches;
}
