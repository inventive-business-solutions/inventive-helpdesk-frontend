"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import type { Division } from "../../types";

/** Rename a division. Its code (and every existing ticket ID) is left unchanged —
 *  only the display name updates, across the client card and its tickets. */
export function EditDivisionModal({
  clientName,
  division,
  onClose,
}: {
  clientName: string;
  division: Division;
  onClose: () => void;
}) {
  const clients = useStore((s) => s.clients);
  const updateDivision = useStore((s) => s.updateDivision);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(division.name);
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm) {
      setErr(true);
      return;
    }
    if (nm === division.name) {
      onClose();
      return;
    }
    const client = clients.find((c) => c.name === clientName);
    if (
      client?.divisions.some((d) => d.name !== division.name && d.name.toLowerCase() === nm.toLowerCase())
    ) {
      setErr(true);
      toast("This client already has a division with that name");
      return;
    }
    run(() => updateDivision(clientName, division.name, { name: nm }), {
      success: `Division renamed to ${nm}`,
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      title={`Edit division — ${clientName}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Save changes" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Division name"
          required
          value={name}
          error={err}
          autoFocus
          placeholder="e.g. Boiler"
          onChange={(v) => {
            setName(v);
            if (err) setErr(false);
          }}
        />
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            The division code (<b>{division.code}</b>) and existing ticket IDs stay the same — only the name
            changes, everywhere it appears.
          </div>
        </div>
      </div>
    </Modal>
  );
}
