"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Field, TextField, CheckboxField } from "../ui/Field";
import { Select } from "../ui/Select";
import { ModalFooter } from "../ui/ModalFooter";
import { IconButton } from "../ui/IconButton";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";
import type { ClientStatus } from "../../types";

const STATUSES: ClientStatus[] = ["Onboarding", "Active", "On Hold", "Churned"];

type LeadDraft = { name: string; email: string; phone: string; invite: boolean };

const blankLead = (): LeadDraft => ({ name: "", email: "", phone: "", invite: false });

/** Onboard a client: the company, when it came on board, and who leads it on their side.
 *
 *  Deliberately no division and no product. Divisions arrive later — often much later, and
 *  sometimes never — and a product is an engagement with its own dates, so both are added
 *  from the client card once the client exists. Requiring them here is what made this
 *  dialog wrong for how Inventive actually onboards.
 *
 *  Leads created here hold NO divisions, because none exist yet. That means no portal
 *  access until someone assigns them from a division, which the note in the dialog says
 *  out loud — an invited lead who then sees an empty portal would otherwise look broken. */
export function AddClientModal({ onClose }: { onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const addClient = useStore((s) => s.addClient);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [status, setStatus] = useState<ClientStatus>("Onboarding");
  const [leads, setLeads] = useState<LeadDraft[]>([]);
  const [errors, setErrors] = useState<{ name?: boolean; start?: boolean }>({});

  const setLead = (i: number, patch: Partial<LeadDraft>) =>
    setLeads((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = { name: !name.trim(), start: !start };
    setErrors(errs);
    if (errs.name || errs.start) return;
    if (clients.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      setErrors({ name: true });
      toast("A client with that name already exists");
      return;
    }
    // Drop rows the user opened and left blank rather than making them delete each one.
    const filled = leads.filter((l) => l.name.trim() || l.email.trim());
    for (const l of filled) {
      if (!l.name.trim()) return toast("Give every lead a name, or remove the empty row");
      if (!isEmail(l.email)) return toast(`Enter a valid email for ${l.name.trim()}`);
    }
    const emails = filled.map((l) => l.email.trim().toLowerCase());
    const dupe = emails.find((e, i) => emails.indexOf(e) !== i);
    if (dupe) return toast(`${dupe} is listed twice — each person needs their own address`);

    run(
      () =>
        addClient({
          name: name.trim(),
          since: start,
          status,
          leads: filled.map((l) => ({
            name: l.name.trim(),
            email: l.email.trim(),
            phone: l.phone.trim() || undefined,
            invite: l.invite,
          })),
        }),
      { success: `Client ${name.trim()} onboarded`, onSuccess: onClose },
    );
  };

  return (
    <Modal
      title="Onboard client"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter submitLabel="Onboard client" busyLabel="Saving…" busy={busy} onCancel={onClose} />
      }
    >
      <div className="modal-body">
        <TextField
          label="Client name"
          required
          value={name}
          error={errors.name}
          placeholder="e.g. Thermax"
          onChange={(v) => {
            setName(v);
            setErrors((x) => ({ ...x, name: false }));
          }}
        />
        <div className="field-2">
          <TextField
            label="Onboarding date"
            required
            type="date"
            value={start}
            error={errors.start}
            onChange={(v) => {
              setStart(v);
              setErrors((x) => ({ ...x, start: false }));
            }}
          />
          <Field label="Status">
            {(id) => (
              <Select
                id={id}
                block
                label="Select status"
                ariaLabel="Client status"
                value={status}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setStatus(v as ClientStatus)}
              />
            )}
          </Field>
        </div>

        <div className="lead-section">
          <div className="lead-section-head">
            <span className="eyebrow">Client leads</span>
            <span className="lead-count">{leads.length ? `${leads.length} added` : "optional"}</span>
          </div>

          {leads.map((lead, i) => (
            <div className="lead-card" key={i}>
              <div className="lead-card-head">
                <span className="lead-card-title">{lead.name.trim() || `Lead ${i + 1}`}</span>
                <IconButton
                  size="sm"
                  tone="danger"
                  icon={<Icon name="x" />}
                  label="Remove lead"
                  onClick={() => setLeads((ls) => ls.filter((_, idx) => idx !== i))}
                />
              </div>
              <TextField
                label="Name"
                value={lead.name}
                placeholder="e.g. Akash Sharma"
                onChange={(v) => setLead(i, { name: v })}
              />
              <div className="field-2">
                <TextField
                  label="Email"
                  type="email"
                  value={lead.email}
                  placeholder="name@company.com"
                  onChange={(v) => setLead(i, { email: v })}
                />
                <TextField
                  label="Phone"
                  optional
                  value={lead.phone}
                  placeholder="+91 98765 43210"
                  onChange={(v) => setLead(i, { phone: v })}
                />
              </div>
              <CheckboxField checked={lead.invite} onChange={(v) => setLead(i, { invite: v })}>
                Invite to the client portal
              </CheckboxField>
            </div>
          ))}

          <button type="button" className="add-lead" onClick={() => setLeads((ls) => [...ls, blankLead()])}>
            <Icon name="plus" size={13} />
            {leads.length ? "Add another lead" : "Add a lead"}
          </button>
        </div>

        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Only the client name and onboarding date are required. Add divisions and products from the
            client card once it exists — many clients have none at first. Leads added here can sign in,
            but see no tickets until you give them a division, which you do when adding one.
          </div>
        </div>
      </div>
    </Modal>
  );
}
