"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";

import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { EngagementFields } from "./EngagementFields";
import { scopedDivisions } from "../../lib/engagement";
import { sameName } from "../../lib/helpers";
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
  clientName: fixedClient,
  existing,
  presetProduct,
  onClose,
  onDelete,
}: {
  /** Omitted when opened from the Products page, which knows the product but not yet the
   *  client — the dialog then asks for one rather than making the caller run a separate
   *  picker first. Always supplied from a client card. */
  clientName?: string;
  existing?: ClientProduct;
  /** Seeds the product name WITHOUT putting the dialog in edit mode (`existing` does
   *  that). Used when assigning a catalogue product from the Products page. */
  presetProduct?: string;
  onClose: () => void;
  /** Rendered as Remove in the footer when editing. This is the manage view for an
   *  engagement, so detaching one happens here rather than from a bare ✕ in a row. */
  onDelete?: () => void;
}) {
  const clients = useStore((s) => s.clients);
  const products = useStore((s) => s.products);
  const addClientProduct = useStore((s) => s.addClientProduct);
  const updateClientProduct = useStore((s) => s.updateClientProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const productNames = products.map((p) => p.name);

  const [pickedClient, setPickedClient] = useState(fixedClient ?? clients[0]?.name ?? "");
  const clientName = fixedClient ?? pickedClient;
  const client = clients.find((c) => c.name === clientName);

  // Two separate pieces of state, not one shared box. If picking "EniMAX" then switching to
  // New pre-filled the name field with it, the fastest path through the dialog would be to
  // create a duplicate of the product you had just selected — which is the exact bug this
  // field exists to prevent.
  const [mode, setMode] = useState<"existing" | "new">(productNames.length ? "existing" : "new");
  const [picked, setPicked] = useState(existing?.product ?? presetProduct ?? "");
  const [draft, setDraft] = useState("");
  const product = mode === "existing" ? picked : draft.trim();
  const [devStart, setDevStart] = useState(existing?.devStart ?? "");
  const [completion, setCompletion] = useState(existing?.expectedCompletion ?? "");
  const [divisions, setDivisions] = useState<string[]>(existing?.divisions ?? []);
  const [productErr, setProductErr] = useState(false);

  // Flagged while you type, not after you save. Case- and whitespace-insensitive, so
  // "enimax" is recognised as the existing EniMAX rather than waved through as new.
  const draftClashes = mode === "new" && !!draft.trim() && productNames.some((n) => sameName(n, draft));

  const divs = client?.divisions ?? [];
  const hasDivisions = divs.length > 0;
  // Scope is now an explicit choice rather than something inferred from an empty checklist
  // — "client-wide" used to mean "you ticked nothing", which is indistinguishable from not
  // having decided yet, and needed a confirm dialog to ask what you meant. An existing
  // engagement with no divisions IS client-wide; a new one starts client-wide when there
  // are no divisions to choose from.
  const [scope, setScope] = useState<"client" | "divisions">(
    existing ? (existing.divisions.length ? "divisions" : "client") : hasDivisions ? "divisions" : "client",
  );
  const sendDivisions = () => scopedDivisions(scope, client, divisions);

  const save = () =>
    run(
      () =>
        existing
          ? updateClientProduct(existing.id, {
              product: product.trim(),
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              // Empty = client-wide. Sent from the scope choice, not from whatever happens
              // to be ticked, so switching to client-wide actually clears the divisions.
              divisions: sendDivisions(),
            })
          : addClientProduct(clientName, {
              product: product.trim(),
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              divisions: sendDivisions(),
            }),
      {
        success: `${product.trim()} ${existing ? "updated" : `added to ${clientName}`}`,
        onSuccess: onClose,
      },
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName) {
      toast("Choose a client to attach this product to");
      return;
    }
    if (!product.trim()) {
      setProductErr(true);
      toast(mode === "existing" ? "Choose a product" : "Name the new product");
      return;
    }
    // The guard that makes the two modes worth having. Without it, New product would be the
    // old free-text field wearing a label, and a near-miss name would still mint a
    // duplicate that splits this product's clients and tickets across two catalogue rows.
    if (draftClashes) {
      setProductErr(true);
      toast(`${draft.trim()} already exists — pick it under Existing product`);
      return;
    }
    if (devStart && completion && completion < devStart) {
      toast("Expected completion can't be before the dev start date");
      return;
    }
    if (scope === "divisions" && hasDivisions && divisions.length === 0) {
      toast("Pick at least one division, or set this product to client-wide");
      return;
    }
    save();
  };

  return (
    <Modal
      title={
        existing
          ? `Edit product — ${clientName}`
          : fixedClient
            ? `Add product — ${clientName}`
            : `Assign ${presetProduct || "product"} to a client`
      }
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={existing ? "Save product" : "Add product"}
          busyLabel="Saving…"
          busy={busy}
          onCancel={onClose}
          left={
            onDelete ? (
              <Button variant="ghost" danger onClick={onDelete} disabled={busy}>
                Remove product
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="modal-body">
        {/* Only when the caller didn't fix one — i.e. opened from the Products page. */}
        {!fixedClient && (
          <Field label="Client" required>
            {(id) => (
              <Select
                id={id}
                block
                label="Select client"
                ariaLabel="Client"
                value={pickedClient}
                options={clients.map((c) => ({ value: c.name, label: c.name }))}
                onChange={(v) => {
                  setPickedClient(v);
                  // Divisions belong to the previous client — carrying them over would
                  // fail validation server-side ("Division X belongs to Y, not Z").
                  setDivisions([]);
                }}
              />
            )}
          </Field>
        )}
        {/* An explicit choice, not a text box. This field used to be free text resolved
            find-or-create, so "EniMax" silently became a second catalogue product beside
            "EniMAX" and nothing on screen said so. Creating is now a mode you select. */}
        <Field label="Product" required error={productErr}>
          {(id) => (
            <>
              <Segmented
                ariaLabel="Product source"
                options={[
                  { key: "existing", label: "Existing product" },
                  { key: "new", label: "New product" },
                ]}
                value={mode}
                onChange={(v) => {
                  setMode(v as "existing" | "new");
                  setProductErr(false);
                }}
              />
              {mode === "existing" ? (
                <Select
                  id={id}
                  block
                  label="Select a product"
                  ariaLabel="Product"
                  value={picked}
                  options={productNames.map((n) => ({ value: n, label: n }))}
                  onChange={(v) => {
                    setPicked(v);
                    setProductErr(false);
                  }}
                  invalid={productErr}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={draft}
                  placeholder="e.g. EniMAX"
                  aria-invalid={productErr || undefined}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setProductErr(false);
                  }}
                />
              )}
              {mode === "existing" && productNames.length === 0 && (
                <div className="field-hint">
                  No products in the catalogue yet — switch to <b>New product</b> to add the first one.
                </div>
              )}
              {draftClashes && (
                <div className="field-hint">
                  <b>{draft.trim()}</b> already exists — pick it under <b>Existing product</b> instead of
                  creating a second one.
                </div>
              )}
              {mode === "new" && !draftClashes && !!draft.trim() && (
                <div className="field-hint">
                  <b>{draft.trim()}</b> will be added to the catalogue when you save.
                </div>
              )}
            </>
          )}
        </Field>
        <EngagementFields
          client={client}
          clientName={clientName}
          devStart={devStart}
          onDevStart={setDevStart}
          completion={completion}
          onCompletion={setCompletion}
          scope={scope}
          onScope={setScope}
          divisions={divisions}
          onDivisions={setDivisions}
        />
      </div>
    </Modal>
  );
}
