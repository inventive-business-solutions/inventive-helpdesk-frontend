/**
 * The desktop-only gate, and specifically the one number in it that is easy to get wrong.
 *
 * Below the breakpoint the app is replaced by a panel telling the visitor to switch on
 * their browser's desktop mode. That instruction only works if the width desktop mode
 * produces is ABOVE the breakpoint — otherwise following the advice lands them on the
 * same panel and there is no way forward at all.
 *
 * Chrome and Safari both lay out "Request desktop site" at roughly 980px, ignoring the
 * document's width=device-width. So the cutoff has to stay under that. Raising it to a
 * rounder-looking 1024 to "also block landscape tablets" is the obvious future edit and
 * it silently breaks the panel's own instructions — nothing about the CSS would look
 * wrong, and it would only ever be noticed by a user who is already stuck.
 *
 * Asserted against the stylesheet text rather than a rendered browser: there is no
 * headless browser in this project, and the failure being guarded is a wrong constant,
 * which the source shows directly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** The `@media (max-width: …)` block that hides the app, with its body. */
function gateBlock() {
  const start = css.search(/@media \(max-width: [\d.]+px\) \{\s*\.app-root \{\s*display: none/);
  expect(start, "no max-width block hiding .app-root — the gate is gone or was renamed").toBeGreaterThan(-1);
  const width = Number(css.slice(start).match(/@media \(max-width: ([\d.]+)px\)/)![1]);
  // Walk braces to find the block's extent, so assertions cannot accidentally match
  // rules that live outside it.
  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  return { width, body: css.slice(start, end) };
}

describe("viewport gate", () => {
  const DESKTOP_MODE_WIDTH = 980;

  it(`breaks below ${DESKTOP_MODE_WIDTH}px, so "use desktop mode" actually resolves`, () => {
    expect(gateBlock().width).toBeLessThan(DESKTOP_MODE_WIDTH);
  });

  it("still blocks an upright tablet (768px) and every phone", () => {
    // The point of the feature. 834 is iPad Air portrait, 430 the widest common phone.
    const { width } = gateBlock();
    for (const w of [390, 430, 768, 834]) expect(w).toBeLessThan(width);
  });

  it("lets a landscape tablet and any laptop through", () => {
    const { width } = gateBlock();
    for (const w of [1024, 1280, 1440, 1920]) expect(w).toBeGreaterThanOrEqual(width);
  });

  it("swaps both sides — app hidden, panel shown", () => {
    const { body } = gateBlock();
    expect(body).toMatch(/\.app-root \{\s*display: none/);
    expect(body).toMatch(/\.viewport-gate \{\s*display: flex/);
  });

  it("defaults to showing the app, so a stylesheet that fails to load is not a blank page", () => {
    // Deliberately the reverse of mobile-first: the unconditional rules must leave the
    // app visible and the panel hidden, so the media query is the only thing that can
    // hide the product.
    const base = css.slice(0, css.indexOf("@media (max-width: 899.98px)"));
    expect(base).toMatch(/\.app-root \{\s*(?:\/\*[\s\S]*?\*\/\s*)?display: contents/);
    expect(base).toMatch(/\.viewport-gate \{\s*display: none/);
  });
});
