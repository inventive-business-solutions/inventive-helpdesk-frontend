"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Chips";
import { Select } from "../ui/Select";
import { TextField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";

/** Edit a product: rename it (cascades to every client running it) and/or assign it
 *  to another client. Assigning a product that's already in use prompts to keep it
 *  common to all clients or move it. Ticket IDs never change — they're generated from
 *  each client + division code, not the product. */
export function EditProductModal({ product, onClose }: { product: string; onClose: () => void }) {
  const products = useStore((s) => s.products);
  const clients = useStore((s) => s.clients);
  const renameProduct = useStore((s) => s.renameProduct);
  const assignProductToClient = useStore((s) => s.assignProductToClient);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState(product);
  const [assignClient, setAssignClient] = useState("");
  const [err, setErr] = useState(false);
  const [confirmClient, setConfirmClient] = useState<string | null>(null);

  const running = clients.filter((c) => c.product === product);
  const available = clients.filter((c) => c.product !== product);
  const nm = name.trim();
  const renamed = nm !== product;

  const validName = () => {
    if (!nm) {
      setErr(true);
      return false;
    }
    if (renamed && products.some((p) => p.toLowerCase() === nm.toLowerCase())) {
      setErr(true);
      toast("A product with that name already exists");
      return false;
    }
    return true;
  };

  // Apply the (optional) rename and (optional) assignment. `keepExisting` only
  // matters when assigning: true = common to all clients, false = move.
  const commit = (keepExisting: boolean) => {
    const client = assignClient;
    run(
      async () => {
        if (renamed) await renameProduct(product, nm);
        if (client) await assignProductToClient(nm, client, keepExisting);
      },
      {
        success: client
          ? keepExisting
            ? `${nm} is now shared with ${client}`
            : `${nm} moved to ${client}`
          : `Renamed to ${nm}`,
        onSuccess: onClose,
      },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validName()) return;
    if (assignClient) {
      // Already run by someone → ask whether to keep it common or move it.
      if (running.length > 0) return setConfirmClient(assignClient);
      commit(true); // was unassigned — just assign it
      return;
    }
    if (!renamed) return onClose(); // nothing changed
    commit(true);
  };

  if (confirmClient) {
    return (
      <Modal
        title="Product already in use"
        onClose={() => setConfirmClient(null)}
        disableClose={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClient(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => commit(false)} disabled={busy}>
              Move to {confirmClient}
            </Button>
            <Button variant="primary" onClick={() => commit(true)} disabled={busy}>
              Keep common
            </Button>
          </>
        }
      >
        <div className="modal-body">
          <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6 }}>
            <b>{nm}</b> is already run by {running.map((c) => c.name).join(", ")}. Assign it to{" "}
            <b>{confirmClient}</b> as well — keeping it <b>common</b> to all of them — or <b>move</b> it to{" "}
            {confirmClient} only (it&rsquo;ll be removed from the others)?
          </p>
          <div className="auth-note">
            <Icon name="info" size={14} />
            <div>
              Either way, every client keeps its own ticket IDs — they&rsquo;re generated from the client
              &amp; division code, never the product. Nothing merges.
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Edit ${product}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Save changes" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
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
        {available.length > 0 && (
          <Field label="Assign to another client" optional>
            {(id) => (
              <Select
                id={id}
                block
                label="— Select a client —"
                ariaLabel="Assign to another client"
                value={assignClient}
                options={[
                  { value: "", label: "— Select a client —" },
                  ...available.map((c) => ({
                    value: c.name,
                    label: c.name + (c.product ? ` — currently runs ${c.product}` : ""),
                  })),
                ]}
                onChange={setAssignClient}
              />
            )}
          </Field>
        )}
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Renaming updates the product across every client that runs it. Assigning it to a client that
            already has a product replaces theirs.
          </div>
        </div>
      </div>
    </Modal>
  );
}
