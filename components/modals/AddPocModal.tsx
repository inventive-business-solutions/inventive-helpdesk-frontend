"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, CheckboxField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";
import type { Poc } from "../../types";

export function AddPocModal({
  clientName,
  divName,
  poc,
  onClose,
}: {
  clientName: string;
  divName: string;
  /** When provided (with an id), the modal edits this POC instead of adding one. */
  poc?: Poc;
  onClose: () => void;
}) {
  const addPoc = useStore((s) => s.addPoc);
  const updatePoc = useStore((s) => s.updatePoc);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const editing = !!poc?.id;

  const [name, setName] = useState(poc?.name ?? "");
  const [email, setEmail] = useState(poc?.email ?? "");
  const [primary, setPrimary] = useState(poc?.primary ?? false);
  const [nameErr, setNameErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    if (!isEmail(email)) {
      toast("A POC needs a valid email to be invited to the portal");
      return;
    }
    run(
      editing
        ? () => updatePoc(poc!.id!, { name: name.trim(), email: email.trim(), primary })
        : () => addPoc(clientName, divName, { name: name.trim(), email: email.trim(), primary }),
      {
        success: editing
          ? `POC ${name.trim()} updated`
          : `POC ${name.trim()} added to ${clientName} · ${divName}`,
        onSuccess: onClose,
      },
    );
  };

  return (
    <Modal
      title={`${editing ? "Edit" : "Add"} POC — ${clientName} · ${divName}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={editing ? "Save changes" : "Add POC"}
          busyLabel="Saving…"
          busy={busy}
          onCancel={onClose}
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Full name"
          value={name}
          error={nameErr}
          placeholder="e.g. P. Deshmukh"
          onChange={(v) => {
            setName(v);
            if (nameErr) setNameErr(false);
          }}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          placeholder="name@company.com"
          onChange={setEmail}
        />
        <CheckboxField checked={primary} onChange={setPrimary}>
          Set as primary POC for this division
        </CheckboxField>
      </div>
    </Modal>
  );
}
