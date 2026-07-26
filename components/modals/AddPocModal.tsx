"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, CheckboxField } from "../ui/Field";
import { CheckList } from "../ui/CheckList";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
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
  onDelete,
}: {
  clientName: string;
  divName: string;
  /** When provided (with an id), the modal edits this POC instead of adding one. */
  poc?: Poc;
  onClose: () => void;
  /** Rendered as Remove in the footer when editing. This is the manage view for a
   *  contact, so removing one happens here rather than from a bare ✕ in a row. */
  onDelete?: () => void;
}) {
  const addPoc = useStore((s) => s.addPoc);
  const updatePoc = useStore((s) => s.updatePoc);
  const client = useStore((s) => s.clients.find((c) => c.name === clientName));
  const toast = useToast();
  const { busy, run } = useSubmit();
  const editing = !!poc?.id;

  const [name, setName] = useState(poc?.name ?? "");
  const [email, setEmail] = useState(poc?.email ?? "");
  const [phone, setPhone] = useState(poc?.phone ?? "");
  const [invite, setInvite] = useState(false);
  // Editing shows every division this person holds, so a lead's other divisions are
  // visible here and cannot be silently dropped by saving the dialog.
  const [divisions, setDivisions] = useState<string[]>(poc?.divisions ?? []);
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
        ? () =>
            updatePoc(poc!.id!, {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              divisions,
            })
        : () =>
            addPoc(clientName, divName, {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              invite,
            }),
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
          left={
            onDelete ? (
              <Button variant="ghost" danger onClick={onDelete} disabled={busy}>
                Remove contact
              </Button>
            ) : undefined
          }
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
        <div className="field-2">
          <TextField
            label="Email"
            type="email"
            value={email}
            placeholder="name@company.com"
            onChange={setEmail}
          />
          <TextField label="Phone" optional value={phone} placeholder="+91 98765 43210" onChange={setPhone} />
        </div>
        {editing ? (
          <CheckList
            label="Divisions this contact can see"
            hint="Turning a division off removes their access to its tickets."
            labelHead="Division"
            metaHead="Code"
            selected={divisions}
            options={(client?.divisions ?? []).map((d) => ({
              value: d.docname ?? d.name,
              label: d.name,
              hint: `${client?.code}-${d.code}`,
            }))}
            onChange={setDivisions}
          />
        ) : (
          <CheckboxField checked={invite} onChange={setInvite}>
            Invite to the client portal
          </CheckboxField>
        )}
      </div>
    </Modal>
  );
}
