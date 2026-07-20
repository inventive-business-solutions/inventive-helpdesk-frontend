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
import { initials } from "../../lib/helpers";
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
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [files, setFiles] = useState<File[]>([]);
  const [titleErr, setTitleErr] = useState(false);
  const [saving, setSaving] = useState(false);

  // Admin logs on behalf of a client; with no clients yet there's nothing to log against.
  const noClients = !isClient && clients.length === 0;
  const activeClient = clients.find((c) => c.name === clientName);
  // Admin picked a client that has no divisions — a division-scoped ticket can't be
  // logged until one exists, so block submit rather than send an empty division.
  const divisionless = !isClient && !!activeClient && activeClient.divisions.length === 0;
  // The product a POC reports against is wired via their division's client (product is
  // client-level, common to the client's divisions). Shown read-only in the context card.
  const ctxProduct = activeClient?.product;

  const onClientChange = (name: string) => {
    setClientName(name);
    const c = clients.find((x) => x.name === name);
    setDivName(c?.divisions[0]?.name ?? "");
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
    setSaving(true);
    try {
      const id = await raiseTicket({
        type,
        priority: isClient ? "Medium" : priority,
        title: title.trim(),
        desc: desc.trim(),
        client: isClient ? (session.client ?? "") : clientName,
        div: isClient ? (session.div ?? "") : divName,
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
          submitDisabled={noClients || divisionless}
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
                <div className="nt-ctx-d">{session.div} division</div>
              </div>
              {ctxProduct && (
                <Badge round tone="accent" className="nt-ctx-prod" title={`Reporting against ${ctxProduct}`}>
                  <Icon name="box" size={13} />
                  {ctxProduct}
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
                    onChange={setDivName}
                  />
                  {divisionless && (
                    <div className="field-hint">This client has no divisions — add one first.</div>
                  )}
                </>
              )}
            </Field>
          </div>
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
