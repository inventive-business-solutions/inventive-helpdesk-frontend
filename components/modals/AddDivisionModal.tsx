"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, CheckboxField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";

export function AddDivisionModal({ clientName, onClose }: { clientName: string; onClose: () => void }) {
  const addDivision = useStore((s) => s.addDivision);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [primary, setPrimary] = useState(false);
  const [nameErr, setNameErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    if (pocName.trim() && !isEmail(pocEmail)) {
      toast("Enter a valid POC email, or clear the POC name");
      return;
    }
    run(
      () =>
        addDivision(clientName, {
          name: name.trim(),
          poc: pocName.trim() ? { name: pocName.trim(), email: pocEmail.trim(), primary } : null,
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
        <div className="field-2">
          <TextField
            label="Point of contact"
            optional
            value={pocName}
            placeholder="e.g. P. Deshmukh"
            onChange={setPocName}
          />
          <TextField
            label="POC email"
            optional
            type="email"
            value={pocEmail}
            placeholder="name@company.com"
            onChange={setPocEmail}
          />
        </div>
        <CheckboxField checked={primary} onChange={setPrimary}>
          Set this POC as the client's primary contact
        </CheckboxField>
      </div>
    </Modal>
  );
}
