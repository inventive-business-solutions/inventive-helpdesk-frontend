"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
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
  const addClientProduct = useStore((s) => s.addClientProduct);
  const updateClientProduct = useStore((s) => s.updateClientProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [pickedClient, setPickedClient] = useState(fixedClient ?? clients[0]?.name ?? "");
  const clientName = fixedClient ?? pickedClient;
  const client = clients.find((c) => c.name === clientName);

  const [product, setProduct] = useState(existing?.product ?? presetProduct ?? "");
  const [devStart, setDevStart] = useState(existing?.devStart ?? "");
  const [completion, setCompletion] = useState(existing?.expectedCompletion ?? "");
  const [divisions, setDivisions] = useState<string[]>(existing?.divisions ?? []);
  const [productErr, setProductErr] = useState(false);

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
  const clientWide = scope === "client" || !hasDivisions;

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
              divisions: clientWide ? [] : divisions,
            })
          : addClientProduct(clientName, {
              product: product.trim(),
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              divisions: clientWide ? [] : divisions,
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
      return;
    }
    if (devStart && completion && completion < devStart) {
      toast("Expected completion can't be before the dev start date");
      return;
    }
    if (!clientWide && divisions.length === 0) {
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
          <TextField label="Dev start date" optional type="date" value={devStart} onChange={setDevStart} />
          <TextField
            label="Expected completion"
            optional
            type="date"
            value={completion}
            onChange={setCompletion}
          />
        </div>

        <Field label="Where does it run?" required>
          {() => (
            <>
              {/* Only shown when there is a choice — a client with no divisions can only
                  be client-wide, and offering a disabled option is noise. */}
              {hasDivisions && (
                <Segmented
                  ariaLabel="Product scope"
                  options={[
                    { key: "client", label: "Client-wide" },
                    { key: "divisions", label: "Specific divisions" },
                  ]}
                  value={clientWide ? "client" : "divisions"}
                  onChange={(v) => setScope(v)}
                />
              )}
              <div className="field-hint">
                {clientWide
                  ? hasDivisions
                    ? `Applies to all of ${clientName}, including divisions added later.`
                    : `${clientName} has no divisions yet, so this applies to the client as a whole. You can scope it to divisions once they exist.`
                  : "Only the divisions ticked below run this product."}
              </div>
            </>
          )}
        </Field>

        {!clientWide && hasDivisions && (
          <CheckList
            label="Divisions running this product"
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
        )}
      </div>
    </Modal>
  );
}
