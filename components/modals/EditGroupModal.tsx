"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { ModalFooter } from "../ui/ModalFooter";
import { Button } from "../ui/Button";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { sameName } from "../../lib/helpers";

/** The manage view for a team: its name and its lead.
 *
 *  Both changes go through one endpoint because the rename decides the docname the lead
 *  write has to address. Splitting them across two calls would mean the second one aiming at
 *  a name the first had already replaced.
 *
 *  Members are not edited here. They are already managed on the card itself, row by row,
 *  and pulling that into a dialog would mean two places to add someone with no way to tell
 *  which one you are looking at.
 */
export function EditGroupModal({
  group,
  onClose,
  onDelete,
}: {
  group: string;
  onClose: () => void;
  /** Rendered as Delete in the footer — removing happens while looking at the record. */
  onDelete?: () => void;
}) {
  const groups = useStore((s) => s.groups);
  const members = useStore((s) => s.members);
  const updateGroup = useStore((s) => s.updateGroup);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const current = groups.find((g) => g.name === group);
  const [name, setName] = useState(group);
  const [lead, setLead] = useState(current?.lead ?? "");
  const [err, setErr] = useState(false);

  const trimmed = name.trim();
  const renaming = !!trimmed && trimmed !== group;
  // Nothing to save is not a state worth a request — Save stays disabled until something
  // actually differs, which also stops an accidental double-submit renaming twice.
  const dirty = renaming || lead !== (current?.lead ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setErr(true);
      return;
    }
    // sameName, not ===: "CAD" and "cad" are the same team to a reader, and Frappe would
    // accept both as separate docs. Excludes this team so re-saving its own name is fine.
    if (renaming && groups.some((g) => g.name !== group && sameName(g.name, trimmed))) {
      setErr(true);
      toast("A team with that name already exists");
      return;
    }
    run(() => updateGroup(group, { group_name: trimmed, lead }), {
      success: renaming ? `Team renamed to "${trimmed}"` : "Team updated",
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      title={`Manage ${group}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel="Save"
          busyLabel="Saving…"
          busy={busy}
          submitDisabled={!dirty}
          onCancel={onClose}
          left={
            onDelete ? (
              <Button variant="ghost" danger onClick={onDelete} disabled={busy}>
                Delete team
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Team name"
          value={name}
          error={err}
          autoFocus
          onChange={(v) => {
            setName(v);
            if (err) setErr(false);
          }}
        />
        {renaming && (
          <div className="field-hint">
            Tickets already routed to this team follow the new name — nothing is unassigned.
          </div>
        )}

        {/* No picker when there is nobody to pick: a list whose only row is "None" is a
            control that cannot do anything. The team keeps whatever lead it has. */}
        {members.length === 0 ? (
          <div className="auth-note">
            No members yet — add one on the <b>Members</b> page to be able to name a team lead.
          </div>
        ) : (
          <>
            <Field label="Team Lead" optional>
              {(id) => (
                <Select
                  id={id}
                  block
                  label="Team Lead"
                  ariaLabel="Team Lead"
                  value={lead}
                  options={[
                    { value: "", label: "— None —" },
                    ...members.map((m) => ({
                      value: m.name,
                      label: m.name + (m.title ? ` — ${m.title}` : ""),
                    })),
                  ]}
                  onChange={setLead}
                />
              )}
            </Field>
            {lead && !current?.members.includes(lead) && (
              <div className="field-hint">{lead} joins the team as a member.</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
