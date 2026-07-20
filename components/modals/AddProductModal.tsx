"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";

/**
 * Add a product (optionally assigning it to a client), or — when `presetName` is
 * given — assign an existing (unassigned) product to a client. A product with no
 * client is created as "unassigned"; creating without a client asks to confirm.
 */
export function AddProductModal({ presetName, onClose }: { presetName?: string; onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const products = useStore((s) => s.products);
  const addProduct = useStore((s) => s.addProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const assignMode = !!presetName;

  const [name, setName] = useState(presetName ?? "");
  const [client, setClient] = useState("");
  const [nameErr, setNameErr] = useState(false);
  const [confirmNoClient, setConfirmNoClient] = useState(false);

  const dup = !assignMode && products.some((p) => p.toLowerCase() === name.trim().toLowerCase());
  const selected = clients.find((c) => c.name === client);

  const save = () =>
    run(() => addProduct(name.trim(), client || undefined), {
      success: client ? `${name.trim()} assigned to ${client}` : `${name.trim()} added`,
      onSuccess: onClose,
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    if (assignMode && !client) {
      toast("Choose a client to assign this product to");
      return;
    }
    if (dup && !client) {
      toast("That product already exists");
      return;
    }
    if (!client) {
      // "continue without a client?" — the product becomes unassigned
      setConfirmNoClient(true);
      return;
    }
    save();
  };

  if (confirmNoClient) {
    return (
      <ConfirmDialog
        title="Add without a client?"
        message={`"${name.trim()}" won't be assigned to any client yet — it will appear under Unassigned until you assign it. Continue?`}
        confirmLabel="Add as unassigned"
        danger={false}
        busy={busy}
        onConfirm={save}
        onClose={() => setConfirmNoClient(false)}
      />
    );
  }

  return (
    <Modal
      title={assignMode ? `Assign product — ${presetName}` : "Add product"}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={assignMode ? "Assign product" : "Add product"}
          busyLabel="Saving…"
          busy={busy}
          onCancel={onClose}
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Product name"
          required
          value={name}
          error={nameErr}
          autoFocus={!assignMode}
          readOnly={assignMode}
          placeholder="e.g. EniMAX"
          onChange={(v) => {
            setName(v);
            if (nameErr) setNameErr(false);
          }}
          hint={
            dup ? "A product with this name already exists — pick a client below to assign it." : undefined
          }
        />
        <Field label="Assign to client" required={assignMode} optional={!assignMode}>
          {(id) => (
            <>
              <Select
                id={id}
                block
                autoFocus={assignMode}
                label={assignMode ? "— Choose a client —" : "— No client (unassigned) —"}
                ariaLabel="Assign to client"
                value={client}
                options={[
                  { value: "", label: assignMode ? "— Choose a client —" : "— No client (unassigned) —" },
                  ...clients.map((c) => ({
                    value: c.name,
                    label: c.name + (c.product ? ` — currently runs ${c.product}` : ""),
                  })),
                ]}
                onChange={setClient}
              />
              {selected?.product && selected.product !== name.trim() && (
                <div className="field-hint">
                  This replaces {selected.name}&rsquo;s current product ({selected.product}).
                </div>
              )}
            </>
          )}
        </Field>
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            A product can be run by more than one client. Leave the client blank to create it now and assign
            it later from the Unassigned tab.
          </div>
        </div>
      </div>
    </Modal>
  );
}
