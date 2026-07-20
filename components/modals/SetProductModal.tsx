"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useSubmit } from "../ui/useSubmit";

export function SetProductModal({
  clientName,
  current,
  onClose,
}: {
  clientName: string;
  current?: string;
  onClose: () => void;
}) {
  const setProduct = useStore((s) => s.setProduct);
  const { busy, run } = useSubmit();
  const [product, setProductName] = useState(current ?? "");
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product.trim()) {
      setErr(true);
      return;
    }
    run(() => setProduct(clientName, product.trim()), {
      success: `Product set for ${clientName}`,
      onSuccess: onClose,
    });
  };

  const remove = () =>
    run(() => setProduct(clientName, ""), {
      success: `Product removed from ${clientName}`,
      onSuccess: onClose,
    });

  return (
    <Modal
      title={`${current ? "Edit" : "Add"} product — ${clientName}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={current ? "Save product" : "Add product"}
          busyLabel="Saving…"
          busy={busy}
          onCancel={onClose}
          left={
            current && (
              <Button variant="ghost" danger onClick={remove} disabled={busy} style={{ marginRight: "auto" }}>
                Remove
              </Button>
            )
          }
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Product name"
          value={product}
          error={err}
          autoFocus
          placeholder="e.g. EniMAX"
          onChange={(v) => {
            setProductName(v);
            if (err) setErr(false);
          }}
        />
        <div className="auth-note">
          The product this client runs — common across all their divisions. Every ticket this client raises is
          against this product, tagged by division.
        </div>
      </div>
    </Modal>
  );
}
