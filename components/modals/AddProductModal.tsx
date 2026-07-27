"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { TextField, Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { Segmented } from "../ui/Segmented";
import { ModalFooter } from "../ui/ModalFooter";
import { EngagementFields } from "./EngagementFields";
import { scopedDivisions } from "../../lib/engagement";
import { sameName } from "../../lib/helpers";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";

/** Add a product to the catalogue, and optionally put it into service in the same step.
 *
 *  It used to do the first half only, ending on a note telling you to go to the Unassigned
 *  tab and assign it from there — two dialogs and a tab switch to record one product that
 *  you already knew the client, dates and divisions for.
 *
 *  Leaving it unassigned is still a first-class choice, not a consolation: a product can be
 *  registered before anyone runs it, and the Unassigned tab exists for exactly that. It is
 *  now a toggle rather than the only available outcome. */
export function AddProductModal({ onClose }: { onClose: () => void }) {
  const products = useStore((s) => s.products);
  const clients = useStore((s) => s.clients);
  const createProduct = useStore((s) => s.createProduct);
  const addClientProduct = useStore((s) => s.addClientProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);
  // Assigning is the default when there is anyone to assign to — it is the common case, and
  // the reason this dialog grew. With no clients on file it is not an option at all.
  const [assign, setAssign] = useState<"client" | "none">(clients.length ? "client" : "none");
  const [pickedClient, setPickedClient] = useState(clients[0]?.name ?? "");
  const [devStart, setDevStart] = useState("");
  const [completion, setCompletion] = useState("");
  const [divisions, setDivisions] = useState<string[]>([]);
  const [scope, setScope] = useState<"client" | "divisions">("client");

  const client = clients.find((c) => c.name === pickedClient);
  const hasDivisions = (client?.divisions ?? []).length > 0;
  const toClient = assign === "client";

  const trimmed = name.trim();
  // Case- and whitespace-insensitive, matching the picker in AddClientProductModal: a
  // catalogue with both "EniMAX" and "enimax" is the bug both dialogs guard against.
  const dup = !!trimmed && products.some((p) => sameName(p.name, trimmed));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || dup) {
      setNameErr(true);
      if (dup) toast(`${trimmed} is already in the catalogue`);
      return;
    }
    if (toClient) {
      if (!pickedClient) {
        toast("Choose a client, or switch to Leave unassigned");
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
    }
    run(
      // addClientProduct resolves the product name find-or-create, so it registers the
      // catalogue entry AND the engagement in one go — no need to create it separately
      // first and risk leaving an orphan behind if the second call fails.
      toClient
        ? () =>
            addClientProduct(pickedClient, {
              product: trimmed,
              devStart: devStart || undefined,
              expectedCompletion: completion || undefined,
              divisions: scopedDivisions(scope, client, divisions),
            })
        : () => createProduct(trimmed),
      {
        success: toClient ? `${trimmed} added to ${pickedClient}` : `${trimmed} added to the catalogue`,
        onSuccess: onClose,
      },
    );
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
          hint={dup ? "A product with this name already exists." : undefined}
        />

        <Field label="Assign it now?" required>
          {() => (
            <>
              <Segmented
                ariaLabel="Assignment"
                options={[
                  { key: "client", label: "Assign to a client" },
                  { key: "none", label: "Leave unassigned" },
                ]}
                value={toClient ? "client" : "none"}
                onChange={(v) => setAssign(v as "client" | "none")}
              />
              {!toClient && (
                <div className="field-hint">
                  Added to the catalogue only. It appears under <b>Unassigned</b>, ready to assign to a client
                  — with its dates and divisions — whenever that is decided.
                </div>
              )}
            </>
          )}
        </Field>

        {toClient &&
          (clients.length === 0 ? (
            <div className="auth-note">
              <Icon name="info" size={14} />
              <div>
                No clients on file yet, so there is nothing to assign this to. Switch to{" "}
                <b>Leave unassigned</b> and attach it once a client exists.
              </div>
            </div>
          ) : (
            <>
              <Field label="Client" required>
                {(id) => (
                  <Select
                    id={id}
                    block
                    label="Select a client"
                    ariaLabel="Client"
                    value={pickedClient}
                    options={clients.map((c) => ({ value: c.name, label: c.name }))}
                    onChange={(v) => {
                      setPickedClient(v);
                      // Divisions belong to the previous client — carrying them over would
                      // fail server-side ("Division X belongs to Y, not Z").
                      setDivisions([]);
                      setScope("client");
                    }}
                  />
                )}
              </Field>
              <EngagementFields
                client={client}
                clientName={pickedClient}
                devStart={devStart}
                onDevStart={setDevStart}
                completion={completion}
                onCompletion={setCompletion}
                scope={scope}
                onScope={setScope}
                divisions={divisions}
                onDivisions={setDivisions}
              />
            </>
          ))}
      </div>
    </Modal>
  );
}
