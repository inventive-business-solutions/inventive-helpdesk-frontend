"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Field, TextField } from "../ui/Field";
import { Select } from "../ui/Select";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import type { Client, ClientStatus } from "../../types";

const STATUSES: ClientStatus[] = ["Onboarding", "Active", "On Hold", "Churned"];

/** Edit a client's core identity: name (renames + cascades across its tickets,
 *  divisions and POCs), code, onboarding date and status. Products, divisions,
 *  leads and POCs are managed from the client card itself. */
export function EditClientModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const updateClient = useStore((s) => s.updateClient);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState(client.name);
  const [code, setCode] = useState(client.code);
  const [since, setSince] = useState(client.since ?? "");
  const [status, setStatus] = useState<ClientStatus>(client.status);
  const [errs, setErrs] = useState<{ name?: boolean; code?: boolean; since?: boolean }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { name: !name.trim(), code: !code.trim(), since: !since };
    if (next.name || next.code || next.since) {
      setErrs(next);
      return;
    }
    const nm = name.trim().toLowerCase();
    const cd = code.trim().toLowerCase();
    if (clients.some((c) => c.name !== client.name && c.name.toLowerCase() === nm)) {
      setErrs({ name: true });
      toast("Another client already has that name");
      return;
    }
    if (clients.some((c) => c.name !== client.name && c.code.toLowerCase() === cd)) {
      setErrs({ code: true });
      toast("Another client already uses that code");
      return;
    }
    run(
      () =>
        updateClient(client.name, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          since,
          status,
        }),
      {
        success: `${name.trim()} updated`,
        onSuccess: onClose,
      },
    );
  };

  return (
    <Modal
      title={`Edit ${client.name}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Save changes" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Client name"
          required
          value={name}
          error={errs.name}
          placeholder="e.g. Forbes Marshall"
          onChange={(v) => {
            setName(v);
            setErrs((x) => ({ ...x, name: false }));
          }}
        />
        <div className="field-2">
          <TextField
            label="Client code"
            required
            value={code}
            error={errs.code}
            maxLength={4}
            uppercase
            placeholder="e.g. FBM"
            onChange={(v) => {
              setCode(v);
              setErrs((x) => ({ ...x, code: false }));
            }}
          />
          <TextField
            label="Onboarding date"
            required
            type="date"
            value={since}
            error={errs.since}
            onChange={(v) => {
              setSince(v);
              setErrs((x) => ({ ...x, since: false }));
            }}
          />
        </div>
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
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Renaming updates the client across all its tickets, divisions and POCs. Existing ticket IDs keep
            their original code. Manage the product, divisions and POCs from the client card.
          </div>
        </div>
      </div>
    </Modal>
  );
}
