"""Find rules that outrank my checklist rules on the same property.

The bug twice over: `.field input {width:100%}` and `.field label {display:block}` both
outrank a single class selector, so my declarations silently lost. This checks the whole
sheet rather than trusting my reading of it.
"""
import re

CSS = open("/home/abhinban/Projects/Inventive-Helpdesk/Frontend/app/globals.css").read()
CSS = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)

# The elements my component actually renders, as (class, html-tag).
TARGETS = [
    ("checklist", "div"), ("checklist-head", "div"), ("checklist-body", "div"),
    ("checklist-row", "label"), ("checklist-label", "span"), ("checklist-meta", "span"),
    ("checklist-input", "input"), ("switch", "span"),
    # everything else this change introduced
    ("cc-section", "section"), ("cc-section-head", "div"),
    ("prod-list", "div"), ("prod-row", "div"), ("prod-ic", "span"), ("prod-id", "div"),
    ("prod-name", "div"), ("prod-meta", "div"), ("prod-actions", "div"),
    ("chip-group", "span"), ("chip", "span"), ("chip-more", "span"), ("chip-empty", "span"),
    ("lead-section", "div"), ("lead-section-head", "div"), ("lead-card", "div"),
    ("lead-card-head", "div"), ("lead-card-title", "span"), ("lead-count", "span"),
    ("add-lead", "button"), ("poc-name-text", "span"),
    ("date-wrap", "span"), ("date-ph", "span"),
]
# Ancestors present on every one of them.
ANCESTORS = {"field", "checklist", "checklist-body", "checklist-row", "modal-body",
             "client-card", "cc-body", "cc-section", "prod-row", "prod-id", "poc-row",
             "poc-id", "poc-name", "lead-section", "lead-card", "div-card", "modal", "date-wrap"}


def specificity(sel):
    ids = len(re.findall(r"(?<![\w-])#[\w-]+", sel))
    classes = len(re.findall(r"(?<![\w-])[.:\[][\w-]+", sel))
    elements = len(re.findall(r"(?<![\w.#:\[-])\b(?:div|span|input|label|button|a|p|h\d|ul|li|table|td|th)\b", sel))
    return (ids, classes, elements)


def matches(sel, cls, tag):
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
    return lead <= ANCESTORS | {cls}


rules = re.findall(r"([^{}]+)\{([^{}]*)\}", CSS)
mine, theirs = [], []
for i, (sels, body) in enumerate(rules):
    props = dict(re.findall(r"([\w-]+)\s*:\s*([^;]+);", body))
    for sel in (x.strip() for x in sels.split(",")):
        if not sel or sel.startswith("@"):
            continue
        for cls, tag in TARGETS:
            if not matches(sel, cls, tag):
                continue
            entry = (i, sel, specificity(sel), props, cls)
            (mine if cls in sel else theirs).append(entry)

print("Rules that could outrank one of the new declarations:\n")
found = False
for i, sel, spec, props, cls in mine:
    for j, osel, ospec, oprops, ocls in theirs:
        if ocls != cls or osel == sel:
            continue
        clash = set(props) & set(oprops)
        for prop in clash:
            wins_by_spec = ospec > spec
            wins_by_order = ospec == spec and j > i
            if wins_by_spec or wins_by_order:
                found = True
                print(f"  .{cls}: `{prop}` — `{osel}` {ospec} beats `{sel}` {spec}")
                print(f"      theirs: {oprops[prop].strip()}   mine: {props[prop].strip()}")
if not found:
    print("  none — every checklist declaration wins on its own element.")
