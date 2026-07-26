"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useSubmit } from "../ui/useSubmit";

/** Add a product to the catalogue.
 *
 *  Catalogue only — it no longer assigns the product to a client. Attaching a product is
 *  creating an *engagement* (client + product + dates + the divisions it covers), which
 *  `AddClientProductModal` owns and both the Products page and the client card now use.
 *  This modal used to write the legacy `Client.product` single Link, which is why a
 *  product assigned here never appeared on the client card. */
export function AddProductModal({ onClose }: { onClose: () => void }) {
  const products = useStore((s) => s.products);
  const createProduct = useStore((s) => s.createProduct);
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);

  const trimmed = name.trim();
  const dup = products.some((p) => p.toLowerCase() === trimmed.toLowerCase());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || dup) {
      setNameErr(true);
      return;
    }
    run(() => createProduct(trimmed), { success: `${trimmed} added`, onSuccess: onClose });
  };

  return (
    <Modal
      title="Add product"
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Add product" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Product name"
          required
          value={name}
          error={nameErr}
          autoFocus
          placeholder="e.g. EniMAX"
          onChange={(v) => {
            setName(v);
            if (nameErr) setNameErr(false);
          }}
          hint={dup && trimmed ? "A product with this name already exists." : undefined}
        />
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            This adds the product to the catalogue. To put it into service, assign it to a client from the
            Unassigned tab — you can set its go-live dates and the divisions it covers there.
          </div>
        </div>
      </div>
    </Modal>
  );
}
