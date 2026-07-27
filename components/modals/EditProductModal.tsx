"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { ManageButton } from "../ui/ManageButton";
import { EmptyState } from "../ui/EmptyState";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { divDisplayName, plural, sameName } from "../../lib/helpers";
import type { ClientProduct } from "../../types";

/** The manage view for a product: its name, and every engagement it is in service under.
 *
 *  Both used to be reachable, but from different buttons in different places — this dialog
 *  renamed and deleted, while a second Manage down on the client row edited that client's
 *  engagement. Two controls a card apart, neither saying which of the two things it acted
 *  on. Managing a product now starts in one place and the engagements are listed here.
 *
 *  Editing an engagement hands back to the caller rather than stacking a second dialog on
 *  this one: nested modals fight over focus and Escape, and the engagement editor is a full
 *  form in its own right. Ticket IDs are unaffected by a rename either way — they come from
 *  the client and division codes, never the product. */
export function EditProductModal({
  product,
  onClose,
  onDelete,
  onEditEngagement,
  onAssign,
}: {
  product: string;
  onClose: () => void;
  /** Rendered as Delete in the footer. This is the manage view, so removing happens here
   *  — while looking at the record — rather than from a bare ✕ in a row. */
  onDelete?: () => void;
  /** Open the engagement editor for one client's use of this product. */
  onEditEngagement?: (clientName: string, eng: ClientProduct) => void;
  /** Put this product into service with another client. */
  onAssign?: () => void;
}) {
  const products = useStore((s) => s.products);
  const clients = useStore((s) => s.clients);
  const renameProduct = useStore((s) => s.renameProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState(product);
  const [err, setErr] = useState(false);
  const nm = name.trim();
  const renamed = nm !== product;
  const dirty = renamed;

  // One row per ENGAGEMENT, not per client: a client may run the same product under more
  // than one division scope, and each of those is a separate editable record. Collapsing
  // them to one row per client would make it arbitrary which one a Manage button edited.
  const engagements = clients.flatMap((c) =>
    c.products.filter((p) => p.product === product).map((eng) => ({ client: c, eng })),
  );

  /** The divisions an engagement covers, or the client-wide marker. Returns null for
   *  client-wide so the row can render it as a chip rather than as plain scope text —
   *  covering everything is a different kind of answer from naming two divisions. */
  const scopeOf = (client: (typeof clients)[number], eng: ClientProduct) =>
    eng.divisions.length ? eng.divisions.map((dn) => divDisplayName(client, dn)).join(", ") : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nm) {
      setErr(true);
      return;
    }
    if (renamed && products.some((p) => sameName(p.name, nm))) {
      setErr(true);
      toast("A product with that name already exists");
      return;
    }
    if (!renamed) return onClose(); // nothing changed
    run(() => renameProduct(product, nm), { success: `Renamed to ${nm}`, onSuccess: onClose });
  };

  return (
    <Modal
      title={`Manage ${product}`}
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

        <Field label={`In service with ${plural(engagements.length, "client")}`}>
          {() => (
            <>
              {engagements.length === 0 ? (
                <EmptyState>
                  Not yet run by any client — assign it to one to set its dates and divisions.
                </EmptyState>
              ) : (
                <div className="eng-list">
                  {engagements.map(({ client, eng }) => (
                    <div className="eng-row" key={eng.id}>
                      <div className="eng-main">
                        <span className="eng-client">{client.name}</span>
                        {scopeOf(client, eng) ? (
                          <span className="eng-scope">{scopeOf(client, eng)}</span>
                        ) : (
                          <span className="chip chip-scope" title={`${product} covers all of ${client.name}`}>
                            Client-wide
                          </span>
                        )}
                      </div>
                      {onEditEngagement && (
                        <ManageButton
                          subject={`${product} at ${client.name}`}
                          onClick={() => onEditEngagement(client.name, eng)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {onAssign && (
                <Button variant="ghost" className="eng-add" onClick={onAssign} disabled={busy}>
                  <Icon name="plus" size={13} />
                  Assign to a client
                </Button>
              )}
            </>
          )}
        </Field>

        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Renaming updates the product everywhere it is used. Dates and division scoping belong to each
            client&rsquo;s engagement — edit those with <b>Manage</b> above.
          </div>
        </div>
      </div>
    </Modal>
  );
}
