"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Chips";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { clientsRunning } from "../../lib/helpers";

/** Rename a product. The rename cascades to every client running it, because Product is
 *  autonamed and the engagements link to it.
 *
 *  Assignment used to live here too, with a "keep common or move it?" prompt — the move
 *  branch cleared the legacy `Client.product` from every other client, which only made
 *  sense while a client could run exactly one product. A client can now run several, so
 *  attaching one is creating an engagement: that is `AddClientProductModal`, reached from
 *  the Products page or the client card. Ticket IDs are unaffected by a rename either
 *  way — they come from the client and division codes, never the product. */
export function EditProductModal({
  product,
  onClose,
  onDelete,
}: {
  product: string;
  onClose: () => void;
  /** Rendered as Delete in the footer. This is the manage view, so removing happens here
   *  — while looking at the record — rather than from a bare ✕ in a row. */
  onDelete?: () => void;
}) {
  const products = useStore((s) => s.products);
  const clients = useStore((s) => s.clients);
  const renameProduct = useStore((s) => s.renameProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState(product);
  const [err, setErr] = useState(false);
  const dirty = name.trim() !== product;

  const running = clientsRunning(clients, product);
  const nm = name.trim();
  const renamed = nm !== product;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nm) {
      setErr(true);
      return;
    }
    if (renamed && products.some((p) => p.toLowerCase() === nm.toLowerCase())) {
      setErr(true);
      toast("A product with that name already exists");
      return;
    }
    if (!renamed) return onClose(); // nothing changed
    run(() => renameProduct(product, nm), { success: `Renamed to ${nm}`, onSuccess: onClose });
  };

  return (
    <Modal
      title={`Edit ${product}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel="Save changes"
          busyLabel="Saving…"
          busy={busy}
          submitDisabled={!dirty}
          onCancel={onClose}
          left={
            onDelete ? (
              <Button variant="ghost" danger onClick={onDelete} disabled={busy}>
                Delete product
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Product name"
          required
          value={name}
          error={err}
          autoFocus
          placeholder="e.g. EniMAX"
          onChange={(v) => {
            setName(v);
            if (err) setErr(false);
          }}
        />
        {running.length > 0 && (
          <div className="field">
            <div className="field-label">Currently run by</div>
            <div className="chip-wrap">
              {running.map((c) => (
                <Badge round key={c.name}>
                  {c.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Renaming updates the product everywhere it is used. To put it into service with another client —
            with its own dates and divisions — use <b>Assign to a client</b> on the Products page.
          </div>
        </div>
      </div>
    </Modal>
  );
}
