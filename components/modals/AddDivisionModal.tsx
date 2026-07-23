"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, CheckboxField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { CheckList } from "../ui/CheckList";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";

/** Add a division to an existing client, and decide who can see it.
 *
 *  A POC is optional — plenty of divisions are tracked before anyone is named — so it sits
 *  behind a toggle rather than empty fields that look required.
 *
 *  Assigning leads here is the point at which a Lead gains any access at all: they are
 *  created during onboarding with no divisions, which means no tickets. This is the dialog
 *  that lets one lead cover two divisions out of five. */
export function AddDivisionModal({ clientName, onClose }: { clientName: string; onClose: () => void }) {
  const addDivision = useStore((s) => s.addDivision);
  const client = useStore((s) => s.clients.find((c) => c.name === clientName));
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [withPoc, setWithPoc] = useState(false);
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [pocPhone, setPocPhone] = useState("");
  const [invite, setInvite] = useState(false);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [nameErr, setNameErr] = useState(false);

  const leads = client?.leads ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    if (withPoc) {
      if (!pocName.trim()) return toast("Enter the contact's name, or turn the contact off");
      if (!isEmail(pocEmail)) return toast("Enter a valid email for the contact");
    }
    run(
      () =>
        addDivision(clientName, {
          name: name.trim(),
          poc: withPoc
            ? {
                name: pocName.trim(),
                email: pocEmail.trim(),
                phone: pocPhone.trim() || undefined,
                invite,
              }
            : null,
          leads: leadIds,
        }),
      { success: `Division ${name.trim()} added to ${clientName}`, onSuccess: onClose },
    );
  };

  return (
    <Modal
      title={`Add division — ${clientName}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Add division" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Division name"
          required
          value={name}
          error={nameErr}
          placeholder="e.g. Boiler"
          onChange={(v) => {
            setName(v);
            if (nameErr) setNameErr(false);
          }}
        />

        <CheckboxField checked={withPoc} onChange={setWithPoc}>
          Add a point of contact for this division
        </CheckboxField>

        {withPoc && (
          <div className="lead-card">
            <TextField
              label="Contact name"
              value={pocName}
              placeholder="e.g. P. Deshmukh"
              onChange={setPocName}
            />
            <div className="field-2">
              <TextField
                label="Email"
                type="email"
                value={pocEmail}
                placeholder="name@company.com"
                onChange={setPocEmail}
              />
              <TextField
                label="Phone"
                optional
                value={pocPhone}
                placeholder="+91 98765 43210"
                onChange={setPocPhone}
              />
            </div>
            <CheckboxField checked={invite} onChange={setInvite}>
              Invite to the client portal
            </CheckboxField>
          </div>
        )}

        {leads.length > 0 && (
          <CheckList
            label="Leads who can see this division"
            hint="Leads see nothing until a division is assigned to them."
            selected={leadIds}
            options={leads.map((l) => ({
              value: l.id ?? l.email,
              label: l.name,
              hint: l.divisions.length
                ? `${l.divisions.length} division${l.divisions.length > 1 ? "s" : ""}`
                : "no access yet",
            }))}
            onChange={setLeadIds}
          />
        )}
      </div>
    </Modal>
  );
}
