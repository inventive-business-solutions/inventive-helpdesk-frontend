"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon, type IconName } from "../ui/Icon";
import { Badge } from "../ui/Chips";
import { Select } from "../ui/Select";
import { TextField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { StagedFiles } from "./StagedFiles";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { availableProductScopes, divDisplayName, initials, productsForDivisions } from "../../lib/helpers";
import { hasBlockingIssue } from "../../lib/attachments";
import type { Priority, TicketType } from "../../types";

const TYPE_OPTIONS: { type: TicketType; hint: string; icon: IconName; color: string }[] = [
  { type: "Bug", hint: "Something is broken", icon: "alert", color: "var(--cat-1)" },
  { type: "Query", hint: "A how-to or question", icon: "chat", color: "var(--cat-2)" },
  { type: "Improvement", hint: "Make something better", icon: "arrowRight", color: "var(--cat-3)" },
  { type: "New Feature", hint: "Add something new", icon: "plus", color: "var(--cat-4)" },
];

const PRIORITY_OPTIONS: { p: Priority; color: string }[] = [
  { p: "Low", color: "var(--muted)" },
  { p: "Medium", color: "var(--warning)" },
  { p: "High", color: "var(--serious)" },
  { p: "Critical", color: "var(--critical)" },
];

export function NewTicketModal({ onClose }: { onClose: () => void }) {
  const session = useStore((s) => s.session);
  const clients = useStore((s) => s.clients);
  const raiseTicket = useStore((s) => s.raiseTicket);
  const toast = useToast();
  const isClient = session?.role === "client";

  const [type, setType] = useState<TicketType>("Bug");
  const [clientName, setClientName] = useState(isClient ? (session?.client ?? "") : (clients[0]?.name ?? ""));
  const [divName, setDivName] = useState(
    isClient ? (session?.div ?? "") : (clients[0]?.divisions[0]?.name ?? ""),
  );
  /** Client only, and only when they hold more than one division: which one this ticket is
   *  being raised against. A DOCNAME, because that is what `session.divisions` carries and
   *  what the server checks against (`ticket_has_permission`: doc.division in p.divisions).
   *  Display names are resolved from it at the point of use — the two are not
   *  interchangeable and `divDisplayName` exists precisely because mixing them matches
   *  nothing, silently. */
  const [divDoc, setDivDoc] = useState(session?.divisions?.[0] ?? "");
  const [product, setProduct] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [files, setFiles] = useState<File[]>([]);
  const [titleErr, setTitleErr] = useState(false);
  const [productErr, setProductErr] = useState(false);
  const [saving, setSaving] = useState(false);

  // Admin logs on behalf of a client; with no clients yet there's nothing to log against.
  const noClients = !isClient && clients.length === 0;
  const activeClient = clients.find((c) => c.name === clientName);
  // Admin picked a client that has no divisions — a division-scoped ticket can't be
  // logged until one exists, so block submit rather than send an empty division.
  const divisionless = !isClient && !!activeClient && activeClient.divisions.length === 0;
  // A contact holds a SET of divisions — one for a division POC, several for a client Lead.
  // A Lead must be able to raise against any of them, and the server already allows exactly
  // that: ticket_has_permission ends in `doc.division in p.divisions`. Only this dialog was
  // narrower, pinning every client ticket to session.div — which types.ts documents as
  // "FIRST division's display name … never use it to decide what a contact may see".
  const heldDivisions = session?.divisions ?? [];
  const multiDivision = isClient && heldDivisions.length > 1;
  // Fall back to session.div for the single-division case, where `divDoc` may be unset and
  // the display name is all that is needed.
  const clientDiv = multiDivision
    ? divDisplayName(activeClient ?? { name: "" }, divDoc)
    : (session?.div ?? "");

  // The products this contact reports against, scoped to the division actually selected —
  // not to every division they hold. Showing the union would advertise products that the
  // picker below then refuses and the backend would reject: see-but-cannot-pick, which is
  // the confusion this whole change exists to remove.
  const ctxProducts = productsForDivisions(
    activeClient,
    multiDivision ? [divDoc].filter(Boolean) : heldDivisions,
  );

  // The last step of the cascade: client -> division -> product. Only the products
  // actually running at the chosen division (plus any attached client-wide), because those
  // are exactly what the backend's validate will accept.
  const effectiveDiv = isClient ? clientDiv : divName;
  const productScopes = availableProductScopes(clients, { client: clientName, div: effectiveDiv });
  // Required when there is something to choose. A division running nothing hides the field
  // entirely rather than blocking submit — the dead end the old `divisionless` flag created.
  const productRequired = productScopes.length > 0;

  const onClientChange = (name: string) => {
    setClientName(name);
    const c = clients.find((x) => x.name === name);
    setDivName(c?.divisions[0]?.name ?? "");
    // Products belong to the previous client's divisions; keeping one would send a value
    // this client doesn't run and the backend would reject it.
    setProduct("");
    setProductErr(false);
  };

  const onDivisionChange = (name: string) => {
    setDivName(name);
    setProduct("");
    setProductErr(false);
  };

  /** Same reset, for the client's own division picker. Clearing the product is not tidiness:
   *  a product live at Heating need not be live at Enviro, and carrying the old choice
   *  across would submit something `_validate_product` rejects server-side — an error at
   *  send time for a field the reader last touched two steps ago. */
  const onClientDivisionChange = (docname: string) => {
    setDivDoc(docname);
    setProduct("");
    setProductErr(false);
  };

  // The modal only opens for an authenticated user; bail defensively if not.
  if (!session) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noClients) return;
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    if (!isClient && !divName) {
      toast(`${clientName || "This client"} has no divisions yet — add one on the Clients page first.`);
      return;
    }
    if (productRequired && !product) {
      setProductErr(true);
      toast("Choose the product you're reporting against");
      return;
    }
    setSaving(true);
    try {
      const id = await raiseTicket({
        type,
        priority: isClient ? "Medium" : priority,
        title: title.trim(),
        desc: desc.trim(),
        client: isClient ? (session.client ?? "") : clientName,
        // `clientDiv` is the DISPLAY name, which is what RaiseTicketInput carries; the store
        // resolves it back to a docname via divDocname before writing. For a single-division
        // contact this is still session.div, so nothing changes for them.
        div: isClient ? clientDiv : divName,
        product: product || undefined,
        raisedBy: isClient ? session.name : "Admin",
        files,
      });
      toast(`Ticket ${id} created`);
      onClose();
    } catch {
      toast("Could not create the ticket — please try again.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isClient ? "Raise a ticket" : "New ticket"}
      onClose={onClose}
      wide
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={isClient ? "Submit ticket" : "Create ticket"}
          busyLabel="Saving…"
          busy={saving}
          // Also blocked while an over-cap file is staged — the upload would be refused and
          // the ticket would already exist by then, leaving a ticket without the evidence
          // that motivated it.
          submitDisabled={noClients || divisionless || hasBlockingIssue(files)}
          onCancel={onClose}
        />
      }
    >
      <div className="modal-body">
        {noClients && (
          <div className="auth-note" style={{ color: "var(--critical)" }}>
            <Icon name="alert" size={14} />
            <div>Add a client on the Clients page before logging a ticket.</div>
          </div>
        )}
        <p className="nt-intro">
          {isClient
            ? "Tell us what's happening — our team picks it up and you'll get every update right here."
            : "Log a request on behalf of a client division and route it to the team."}
        </p>

        <div className="field">
          <div className="field-label">What kind of request is this?</div>
          <div className="type-picker">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.type}
                type="button"
                className={`tp-opt ${type === o.type ? "on" : ""}`}
                style={{ ["--tc" as string]: o.color }}
                onClick={() => setType(o.type)}
                aria-pressed={type === o.type}
              >
                <span className="tp-ic">
                  <Icon name={o.icon} size={16} />
                </span>
                <span className="tp-txt">
                  <span className="tt">{o.type}</span>
                  <span className="td">{o.hint}</span>
                </span>
                {type === o.type && (
                  <span className="tp-check">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isClient ? (
          <div className="field">
            <div className="field-label">Raising for</div>
            <div className="nt-ctx">
              <span className="nt-ctx-av">{initials(session.client ?? "")}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nt-ctx-c">{session.client}</div>
                {/* A Lead holds several divisions and the ticket goes against ONE of them,
                    so it has to be a choice. A division POC holds exactly one — nothing to
                    choose, so they keep the plain label rather than a select with a single
                    row in it. */}
                {multiDivision ? (
                  <Select
                    className="plain"
                    label="Division"
                    ariaLabel="Division this ticket is about"
                    value={divDoc}
                    options={heldDivisions.map((docname) => ({
                      // Value is the docname (what the server checks); label is the display
                      // name (what the reader knows it as).
                      value: docname,
                      label: divDisplayName(activeClient ?? { name: "" }, docname),
                    }))}
                    onChange={onClientDivisionChange}
                  />
                ) : (
                  <div className="nt-ctx-d">{session.div} division</div>
                )}
              </div>
              {/* A division can run several products, so this is a list. Capped, with the
                  full set in the tooltip, so a client running many doesn't stretch the row. */}
              {ctxProducts.slice(0, 2).map((p) => (
                <Badge round tone="accent" className="nt-ctx-prod" key={p} title={`Reporting against ${p}`}>
                  <Icon name="box" size={13} />
                  {p}
                </Badge>
              ))}
              {ctxProducts.length > 2 && (
                <Badge round className="nt-ctx-prod" title={ctxProducts.join(", ")}>
                  +{ctxProducts.length - 2}
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="field-2">
            <Field label="Client">
              {(id) => (
                <Select
                  id={id}
                  block
                  label="Select client"
                  ariaLabel="Client"
                  value={clientName}
                  options={clients.map((c) => ({ value: c.name, label: c.name }))}
                  onChange={onClientChange}
                />
              )}
            </Field>
            <Field label="Division" error={divisionless}>
              {(id) => (
                <>
                  <Select
                    id={id}
                    block
                    label="Select division"
                    ariaLabel="Division"
                    value={divName}
                    options={(activeClient?.divisions ?? []).map((d) => ({ value: d.name, label: d.name }))}
                    onChange={onDivisionChange}
                  />
                  {divisionless && (
                    <div className="field-hint">This client has no divisions — add one first.</div>
                  )}
                </>
              )}
            </Field>
          </div>
        )}

        {/* The last step of the cascade, and the same control for staff and clients: one
            product per ticket, so a single-choice Select — never a multi-select. Hidden
            entirely when the division runs nothing, so a client with no engagements can
            still raise a ticket. */}
        {productRequired && (
          <Field label="Product" required error={productErr}>
            {(id) => (
              <>
                <Select
                  id={id}
                  block
                  label="Select product"
                  ariaLabel="Product"
                  value={product}
                  options={[
                    { value: "", label: "— Choose a product —" },
                    // Client-wide is marked in the option itself. Without it two products
                    // read as equivalent choices when one covers this division specifically
                    // and the other covers the whole client — which is the difference that
                    // decides who sees the resulting ticket.
                    ...productScopes.map((p) => ({
                      value: p.product,
                      label: p.clientWide ? `${p.product} — client-wide` : p.product,
                    })),
                  ]}
                  onChange={(v) => {
                    setProduct(v);
                    if (productErr) setProductErr(false);
                  }}
                />
                <div className="field-hint">
                  {isClient
                    ? "What the issue is about — only the products running in your division are listed."
                    : effectiveDiv
                      ? `Products running at ${effectiveDiv}. Client-wide ones are marked.`
                      : `Everything ${clientName || "this client"} runs. Pick a division above to narrow it.`}
                </div>
              </>
            )}
          </Field>
        )}

        <TextField
          label="Title"
          required
          value={title}
          error={titleErr}
          placeholder="Short summary of the request"
          onChange={(v) => {
            setTitle(v);
            if (titleErr) setTitleErr(false);
          }}
        />

        <Field label="Description" optional>
          {(id) => (
            <textarea
              id={id}
              value={desc}
              placeholder="Describe what's happening, steps to reproduce, drawing reference…"
              onChange={(e) => setDesc(e.target.value)}
            />
          )}
        </Field>

        <div className="field">
          <div className="field-label">
            Attachments <span className="opt">optional</span>
          </div>
          <StagedFiles files={files} onChange={setFiles} />
        </div>

        {!isClient && (
          <div className="field">
            <div className="field-label">Priority</div>
            <div className="prio-seg">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.p}
                  type="button"
                  className={`prio-opt ${priority === o.p ? "on" : ""}`}
                  style={{ ["--pc" as string]: o.color }}
                  onClick={() => setPriority(o.p)}
                  aria-pressed={priority === o.p}
                >
                  <span className="dot" />
                  {o.p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
