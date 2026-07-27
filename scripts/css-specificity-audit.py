"""Find rules that outrank a given set of class rules on the same property.

The bug three times over: `.field input {width:100%}`, `.field label {display:block}` and
`.modal-head h3 {text-transform:capitalize}` all outrank a single class selector, so those
declarations silently lost. This checks the whole sheet rather than trusting a reading of
it.

Run it with `npm run audit:css`, or `python3 scripts/css-specificity-audit.py`.

**A diagnostic, not a test.** It deliberately lives outside `tests/` because nothing runs
it automatically and it is not coverage. Exits 1 when it finds a clash, so it can gate a
command if you ever want it to.

GROUPS is one entry per component, each with its OWN ancestor set. It used to be a single
flat TARGETS list sharing one ANCESTORS set, which worked while it was pointed at one
component at a time — the way the docstring told you to use it. Accumulating several
components in that shape makes them contaminate each other: with `alert-text` in the shared
ancestor set, `.alert-text p` was reported as beating `.auth-hero p`, because nothing said
an auth hero never appears inside an alert dialog. False positives are worse than no tool
here, because the answer to every real finding starts with believing the last one.
"""
import pathlib
import re
import sys

# Relative to this file, so it runs from any checkout and any working directory — it used
# to hardcode one machine's absolute path, which meant it ran nowhere else.
CSS_PATH = pathlib.Path(__file__).resolve().parent.parent / "app" / "globals.css"
CSS = CSS_PATH.read_text()
CSS = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)

# Per component: the elements it actually renders as (class, html-tag), and the classes
# that genuinely appear ABOVE them in the tree. Keep the ancestor sets tight — every extra
# name is a selector the checker will start believing could reach these elements.
GROUPS = {
    # The shared switch: CheckboxField's row in the Add dialogs and the access CheckList's
    # rows now draw the same control. `.check-row` never applied its `display: flex` here,
    # which a native checkbox survived (inline, but with an intrinsic size) and a styled
    # <span> did not — the switch collapsed to zero width and dropped its knob on the text.
    "switch": {
        "targets": [
            ("check-row", "label"), ("sw-input", "input"), ("switch", "span"),
            ("checklist-row", "label"), ("checklist-label", "span"), ("checklist-meta", "span"),
        ],
        "ancestors": {"field", "modal-body", "modal", "check-row",
                      "checklist", "checklist-body", "checklist-row"},
    },
    # AlertDialog. `.alert-text h3` is the one that matters: `.modal-head h3` capitalizes and
    # these titles are sentences, so the check proves the rule cannot reach them.
    "alert-dialog": {
        "targets": [
            ("alert", "div"), ("alert-body", "div"), ("alert-ic", "span"),
            ("alert-text", "div"), ("alert-foot", "div"),
            ("alert-text", "h3"), ("alert-text", "p"),
        ],
        "ancestors": {"modal-bg", "nested", "modal", "alert",
                      "danger", "warning", "info", "alert-body", "alert-text", "alert-foot"},
    },
    # Auth screens: the staggered entrances and the display type. The headings are the ones
    # to watch — they sit right beside the capitalize list at the top of the sheet.
    "auth": {
        "targets": [
            ("auth-brand", "aside"), ("auth-hero", "div"), ("auth-hero", "h1"), ("auth-hero", "p"),
            ("auth-card", "form"), ("auth-card", "h2"), ("auth-head", "div"),
            ("brand-mark", "div"), ("auth-field", "div"),
            ("auth-note", "div"), ("auth-submit", "button"),
            # The indexed list that replaced the tick rows.
            ("brand-points", "ol"), ("brand-point", "li"), ("bp-n", "span"), ("bp-t", "span"),
        ],
        "ancestors": {"login", "auth-brand", "auth-panel", "auth-card", "auth-hero",
                      "auth-form", "auth-field", "auth-head", "brand-points", "brand-point",
                      "viewport-gate"},
    },
}


def specificity(sel):
    ids = len(re.findall(r"(?<![\w-])#[\w-]+", sel))
    classes = len(re.findall(r"(?<![\w-])[.:\[][\w-]+", sel))
    elements = len(re.findall(r"(?<![\w.#:\[-])\b(?:div|span|input|label|button|a|p|h\d|ul|li|table|td|th|aside|section|form)\b", sel))
    return (ids, classes, elements)


def matches(sel, cls, tag, ancestors):
    # A pseudo-element styles a sub-part, not the element, so it can never override a
    # declaration on the element itself. And a [type=...] selector only applies to that
    # input type — our only <input> is a checkbox.
    if "::" in sel:
        return False
    m = re.search(r'\[type="([^"]+)"\]', sel)
    if m and not (tag == "input" and m.group(1) == "checkbox"):
        return False
    """Could this selector match the element? Conservative: the last compound must be
    satisfied by the element's own class/tag, and any other classes named in it must be
    ancestors we actually have."""
    last = re.split(r"[\s>+~]+", sel.strip())[-1]
    own = set(re.findall(r"\.([\w-]+)", last))
    tags = re.findall(r"^([a-z]+)", last)
    if tags and tags[0] != tag:
        return False
    if own and not own <= {cls}:
        return False
    if not own and not tags:
        return False
    lead = set(re.findall(r"\.([\w-]+)", sel)) - own
    return lead <= ancestors | {cls}


rules = re.findall(r"([^{}]+)\{([^{}]*)\}", CSS)
print(f"Auditing {CSS_PATH.name} — rules that could outrank one of the target declarations:\n")
found = False

for group, spec_ in GROUPS.items():
    targets, ancestors = spec_["targets"], spec_["ancestors"]
    mine, theirs = [], []
    for i, (sels, body) in enumerate(rules):
        props = dict(re.findall(r"([\w-]+)\s*:\s*([^;]+);", body))
        for sel in (x.strip() for x in sels.split(",")):
            if not sel or sel.startswith("@"):
                continue
            for cls, tag in targets:
                if not matches(sel, cls, tag, ancestors):
                    continue
                entry = (i, sel, specificity(sel), props, cls)
                (mine if cls in sel else theirs).append(entry)

    hits = []
    for i, sel, spec, props, cls in mine:
        for j, osel, ospec, oprops, ocls in theirs:
            if ocls != cls or osel == sel:
                continue
            for prop in set(props) & set(oprops):
                # Same declared value cannot change rendering, whoever wins. Reporting those
                # buries the real clashes in noise — and this check is only useful if every
                # line it prints is worth reading.
                if oprops[prop].strip() == props[prop].strip():
                    continue
                if ospec > spec or (ospec == spec and j > i):
                    hits.append(
                        f"  .{cls}: `{prop}` — `{osel}` {ospec} beats `{sel}` {spec}\n"
                        f"      theirs: {oprops[prop].strip()}   mine: {props[prop].strip()}"
                    )
    if hits:
        found = True
        print(f"  [{group}]")
        print("\n".join(hits))
    else:
        print(f"  [{group}] none — every target declaration wins on its own element.")

# Exit non-zero on a finding. It always exited 0 before, so it could report a clash and
# still look like a pass to anything calling it.
sys.exit(1 if found else 0)
