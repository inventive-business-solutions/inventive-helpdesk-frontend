"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CheckList } from "../ui/CheckList";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import type { ClientProduct } from "../../types";

/** Attach a product to a client — the engagement, with its own dates.
 *
 *  A product may cover specific divisions or the client as a whole. "The client as a whole"
 *  is an empty division list, which is also the only shape available before any division
 *  exists — so rather than showing an empty selector to a client with no divisions, we say
 *  what will happen and ask them to confirm it. */
export function AddClientProductModal({
  clientName,
  existing,
  onClose,
}: {
  clientName: string;
  existing?: ClientProduct;
  onClose: () => void;
}) {
  const client = useStore((s) => s.clients.find((c) => c.name === clientName));
  const addClientProduct = useStore((s) => s.addClientProduct);
  const updateClientProduct = useStore((s) => s.updateClientProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [product, setProduct] = useState(existing?.product ?? "");
  const [devStart, setDevStart] = useState(existing?.devStart ?? "");
  const [completion, setCompletion] = useState(existing?.expectedCompletion ?? "");
  const [divisions, setDivisions] = useState<string[]>(existing?.divisions ?? []);
  const [productErr, setProductErr] = useState(false);
  const [confirmClientWide, setConfirmClientWide] = useState(false);

  const divs = client?.divisions ?? [];
  const hasDivisions = divs.length > 0;

  const save = () =>
    run(
      () =>
        existing
          ? updateClientProduct(existing.id, {
              product: product.trim(),
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              divisions,
            })
          : addClientProduct(clientName, {
              product: product.trim(),
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              divisions,
            }),
      {
        success: `${product.trim()} ${existing ? "updated" : `added to ${clientName}`}`,
        onSuccess: onClose,
      },
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product.trim()) {
      setProductErr(true);
      return;
    }
    if (devStart && completion && completion < devStart) {
      toast("Expected completion can't be before the dev start date");
      return;
    }
    // No divisions selected — either the client has none, or the user chose not to scope
    // it. Both mean "the client as a whole", which is worth saying out loud once.
    if (divisions.length === 0) {
      setConfirmClientWide(true);
      return;
    }
    save();
  };

  if (confirmClientWide) {
    return (
      <ConfirmDialog
        title={hasDivisions ? "Attach to the whole client?" : "No divisions yet"}
        message={
          hasDivisions
            ? `"${product.trim()}" isn't assigned to any division, so it will apply to ${clientName} as a whole. You can scope it to divisions later.`
            : `${clientName} has no divisions yet, so "${product.trim()}" will be attached to the client itself. Once you add divisions you can scope it to them.`
        }
        confirmLabel="Attach to client"
        danger={false}
        busy={busy}
        onConfirm={save}
        onClose={() => setConfirmClientWide(false)}
      />
    );
  }

  return (
    <Modal
      title={existing ? `Edit product — ${clientName}` : `Add product — ${clientName}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={existing ? "Save product" : "Add product"}
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
          value={product}
          error={productErr}
          placeholder="e.g. EniMAX"
          onChange={(v) => {
            setProduct(v);
            if (productErr) setProductErr(false);
          }}
        />
        <div className="field-2">
          <TextField
            label="Dev start date"
            optional
            type="date"
            value={devStart}
            onChange={setDevStart}
          />
          <TextField
            label="Expected completion"
            optional
            type="date"
            value={completion}
            onChange={setCompletion}
          />
        </div>

        {hasDivisions ? (
          <CheckList
            label="Divisions running this product"
            hint="Leave all off to attach it to the client as a whole."
            labelHead="Division"
            metaHead="Code"
            selected={divisions}
            options={divs.map((d) => ({
              value: d.docname ?? d.name,
              label: d.name,
              hint: `${client?.code}-${d.code}`,
            }))}
            onChange={setDivisions}
          />
        ) : (
          <div className="auth-note">
            <Icon name="info" size={14} />
            <div>
              {clientName} has no divisions yet, so this product will be attached to the client itself.
              Add divisions from the client card and you can scope it to them afterwards.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
