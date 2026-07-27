"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, CheckboxField, Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { Icon } from "../ui/Icon";
import { CheckList } from "../ui/CheckList";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";
import type { Poc } from "../../types";

/** Division-select value meaning "deliberately no division — this person is a client lead".
 *  Distinct from "" (nothing picked yet) so the dialog can tell an answered question from
 *  an unanswered one; never leaves this file — `addPoc` receives "" for a lead. */
const LEAD = "__lead__";

export function AddPocModal({
  clientName,
  divName,
  poc,
  onClose,
  onDelete,
  onInvite,
}: {
  /** Fixed when opened from a client card or a division row. Omitted from the Contacts
   *  directory, which asks for one instead of forcing the caller to filter first. */
  clientName?: string;
  /** Fixed likewise. "" or omitted means the dialog asks, and no choice = a Lead. */
  divName?: string;
  /** When provided (with an id), the modal edits this POC instead of adding one. */
  poc?: Poc;
  onClose: () => void;
  /** Rendered as Remove in the footer when editing. This is the manage view for a
   *  contact, so removing one happens here rather than from a bare ✕ in a row. */
  onDelete?: () => void;
  /** Send or resend the portal sign-in email. Lives here rather than in the row for the
   *  same reason as Remove: this is the manage view, and a per-row button cost every row
   *  a reserved 68px slot — kept even for active contacts who can never use it — which
   *  made Actions the widest thing in the table and forced it to scroll. */
  onInvite?: () => void;
}) {
  const addPoc = useStore((s) => s.addPoc);
  const updatePoc = useStore((s) => s.updatePoc);
  const clients = useStore((s) => s.clients);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const editing = !!poc?.id;

  // The caller's values are the starting point, not a cage: opened from the Contacts page
  // with a client filter active, that client is preselected but still changeable.
  const [pickedClient, setPickedClient] = useState(clientName ?? "");
  const [pickedDiv, setPickedDiv] = useState(divName ?? "");
  const client = clients.find((c) => c.name === pickedClient);
  const divs = client?.divisions ?? [];

  const [name, setName] = useState(poc?.name ?? "");
  const [email, setEmail] = useState(poc?.email ?? "");
  const [phone, setPhone] = useState(poc?.phone ?? "");
  const [invite, setInvite] = useState(false);
  // Editing shows every division this person holds, so a lead's other divisions are
  // visible here and cannot be silently dropped by saving the dialog.
  const [divisions, setDivisions] = useState<string[]>(poc?.divisions ?? []);
  const [nameErr, setNameErr] = useState(false);

  // Being a client lead is now something you PICK, not something inferred from an empty
  // dropdown. Those were the same value before, so the lead notice appeared the moment a
  // client was chosen — before the user had said anything about divisions. Three distinct
  // states: "" = undecided, LEAD = deliberately client-level, anything else = a division.
  const asLead = !editing && pickedDiv === LEAD;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !pickedClient) {
      toast("Choose the client this contact belongs to");
      return;
    }
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    if (!isEmail(email)) {
      toast("A POC needs a valid email to be invited to the portal");
      return;
    }
    // Selecting the lead option IS the confirmation, so there is nothing extra to tick —
    // but an untouched dropdown still has to be resolved, or "I hadn't got to it yet"
    // would silently become "this person answers to the whole client".
    if (!editing && !pickedDiv) {
      toast(
        divs.length
          ? "Choose a division, or select “No division — client lead”"
          : "Select “No division — client lead” to add this contact",
      );
      return;
    }
    run(
      editing
        ? () =>
            updatePoc(poc!.id!, {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              divisions,
            })
        : () =>
            // The sentinel never leaves this dialog: the store reads "" as "no division,
            // therefore a Lead", which is the shape the backend wants.
            addPoc(pickedClient, asLead ? "" : pickedDiv, {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              invite,
            }),
      {
        success: editing
          ? `Contact ${name.trim()} updated`
          : asLead
            ? `${name.trim()} added as a client lead for ${pickedClient}`
            : `Contact ${name.trim()} added to ${pickedClient} · ${pickedDiv}`,
        onSuccess: onClose,
      },
    );
  };

  return (
    <Modal
      // Only names a scope once one is actually chosen — opened cold from the Contacts
      // directory there is nothing true to put here yet.
      title={
        editing
          ? `Edit contact — ${pickedClient}`
          : pickedClient
            ? // Only a real division is named here. `pickedDiv` also carries the LEAD
              // sentinel, which would otherwise print as "Acme Industries · __lead__".
              `Add contact — ${pickedClient}${pickedDiv && !asLead ? ` · ${pickedDiv}` : ""}`
            : "Add contact"
      }
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={editing ? "Save changes" : asLead ? "Add client lead" : "Add contact"}
          busyLabel="Saving…"
          busy={busy}
          onCancel={onClose}
          left={
            onDelete ? (
              <Button variant="ghost" danger onClick={onDelete} disabled={busy}>
                Remove contact
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="modal-body">
        {/* Both pick from existing records only — there is no free-text client or division
            here. A contact is scoped by the client and division it points at, so inventing
            either from this dialog would create a contact scoped to something that does not
            exist. Add the client or division first, then come back. */}
        {!editing && (
          <div className="field-2">
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
                    // Divisions belong to the previous client; carrying one over would
                    // scope this contact to another tenant's division.
                    setPickedDiv("");
                  }}
                />
              )}
            </Field>
            {/* Required, despite being a choice you can answer with "none": the answer
                decides whether this person sees one division or the whole client, and
                leaving it unanswered is not a third meaning. Not disabled when the client
                has no divisions either — the lead option is exactly what you need then. */}
            <Field label="Division" required>
              {(id) => (
                <Select
                  id={id}
                  block
                  label="Select a division"
                  ariaLabel="Division"
                  value={pickedDiv}
                  disabled={!pickedClient}
                  options={[
                    { value: LEAD, label: "No division — client lead" },
                    ...divs.map((d) => ({ value: d.name, label: d.name })),
                  ]}
                  onChange={setPickedDiv}
                />
              )}
            </Field>
          </div>
        )}

        <TextField
          label="Full name"
          value={name}
          error={nameErr}
          placeholder="e.g. P. Deshmukh"
          onChange={(v) => {
            setName(v);
            if (nameErr) setNameErr(false);
          }}
        />
        <div className="field-2">
          <TextField
            label="Email"
            type="email"
            value={email}
            placeholder="name@company.com"
            onChange={setEmail}
          />
          <TextField label="Phone" optional value={phone} placeholder="+91 98765 43210" onChange={setPhone} />
        </div>
        {editing ? (
          <CheckList
            label="Divisions this contact can see"
            hint="Turning a division off removes their access to its tickets."
            labelHead="Division"
            metaHead="Code"
            selected={divisions}
            options={(client?.divisions ?? []).map((d) => ({
              value: d.docname ?? d.name,
              label: d.name,
              hint: `${client?.code}-${d.code}`,
            }))}
            onChange={setDivisions}
          />
        ) : (
          <>
            {/* Explanation, not a gate. Choosing the lead option in the dropdown above is
                already a deliberate act, so asking for a tick as well made the user say the
                same thing twice. This just states what that choice means. */}
            {asLead && (
              <div className="auth-note">
                <Icon name="info" size={14} />
                <div>
                  <b>{name.trim() || "This contact"}</b> will be added as a <b>client lead</b> for{" "}
                  {pickedClient} — a client-level contact, not tied to one division.
                  {divs.length > 0
                    ? " Leads are listed on the client card and can be given division access later."
                    : ` ${pickedClient} has no divisions yet, so a lead is the only kind of contact it can have.`}
                </div>
              </div>
            )}
            <CheckboxField checked={invite} onChange={setInvite}>
              Invite to the client portal
            </CheckboxField>
          </>
        )}

        {/* Portal access, on the manage view only. Adding a contact offers the same thing as
            a tick above, because at that point it is part of one decision; here it is a
            distinct action taken later, so it gets a button and says what it will do.
            Boxed like the Admin dialog's invite path — same meaning, same treatment. */}
        {editing && onInvite && (
          <div className="field alt-path">
            <div className="field-label">Portal access</div>
            {poc?.portal === "active" ? (
              <div className="field-hint">
                {name.trim() || "This contact"} can already sign in to the client portal.
              </div>
            ) : (
              <>
                <div className="field-hint">
                  {poc?.portal === "invited"
                    ? "A sign-in link has been emailed already. Resend it if it never arrived."
                    : "Creates a portal login and emails them a sign-in link."}
                  {!isEmail(email) && " Add a valid email address first."}
                </div>
                <Button disabled={busy || !isEmail(email)} onClick={onInvite}>
                  <Icon name="mail" size={14} />
                  {poc?.portal === "invited" ? "Resend invite" : "Send invite"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
