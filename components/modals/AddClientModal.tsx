"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";

/** Create a client. Name and start date are required; a division is optional (some
 *  clients have none), and a division's POC is optional too. Leaving the product
 *  blank prompts the admin to confirm continuing without one. */
export function AddClientModal({ onClose }: { onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const addClient = useStore((s) => s.addClient);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [division, setDivision] = useState("");
  const [product, setProduct] = useState("");
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: boolean; start?: boolean }>({});
  const [confirmNoProduct, setConfirmNoProduct] = useState(false);

  const create = () =>
    run(
      () =>
        addClient({
          name: name.trim(),
          since: start,
          product: product.trim() || undefined,
          division: division.trim() || undefined,
          // A POC only makes sense with a division to attach it to.
          poc: division.trim() && pocName.trim() ? { name: pocName.trim(), email: pocEmail.trim() } : null,
        }),
      { success: `Client ${name.trim()} added`, onSuccess: onClose },
    );

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
    if (division.trim() && pocName.trim() && !isEmail(pocEmail)) {
      toast("Enter a valid POC email, or clear the POC name");
      return;
    }
    if (!product.trim()) {
      setConfirmNoProduct(true); // prompt: continue without assigning a product?
      return;
    }
    create();
  };

  if (confirmNoProduct) {
    return (
      <ConfirmDialog
        title="Add without a product?"
        message={`"${name.trim()}" won't have a product assigned. You can set one later from the client card or the Products page. Continue?`}
        confirmLabel="Add without product"
        danger={false}
        busy={busy}
        onConfirm={create}
        onClose={() => setConfirmNoProduct(false)}
      />
    );
  }

  return (
    <Modal
      title="Add client"
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Add client" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Client name"
          required
          value={name}
          error={errors.name}
          placeholder="e.g. Forbes Marshall"
          onChange={(v) => {
            setName(v);
            setErrors((x) => ({ ...x, name: false }));
          }}
        />
        <div className="field-2">
          <TextField
            label="Start date"
            required
            type="date"
            value={start}
            error={errors.start}
            onChange={(v) => {
              setStart(v);
              setErrors((x) => ({ ...x, start: false }));
            }}
          />
          <TextField
            label="Product"
            optional
            value={product}
            placeholder="e.g. EniMAX"
            onChange={setProduct}
          />
        </div>
        <TextField
          label="First division"
          optional
          value={division}
          placeholder="e.g. Boiler"
          onChange={setDivision}
        />
        {division.trim() && (
          <div className="field-2">
            <TextField
              label="Division POC"
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
        )}
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Only the client name and start date are required. Add a division now — with an optional POC — or
            later from the client card; some clients have none. Ticket-ID codes are generated automatically,
            and you can invite POCs to the portal after creating.
          </div>
        </div>
      </div>
    </Modal>
  );
}
