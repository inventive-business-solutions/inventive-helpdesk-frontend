"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField, Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const groups = useStore((s) => s.groups);
  const members = useStore((s) => s.members);
  const addGroup = useStore((s) => s.addGroup);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const [name, setName] = useState("");
  const [lead, setLead] = useState(""); // "" = no lead, which is a valid team
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr(true);
      return;
    }
    if (groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase())) {
      setErr(true);
      toast("A team with that name already exists");
      return;
    }
    run(() => addGroup(name.trim(), lead || undefined), {
      success: `Team "${name.trim()}" added`,
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      title="Add team"
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Add team" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <TextField
          label="Team name"
          value={name}
          error={err}
          autoFocus
          placeholder="e.g. Structural Team"
          onChange={(v) => {
            setName(v);
            if (err) setErr(false);
          }}
        />
        {/* Optional, and it stays optional: a team without a lead is a normal team, so the
            first row means "none" rather than a member you have to undo. With nobody on
            file there is nothing to choose, and a picker offering only "no lead" would be a
            control that cannot do anything — say why instead. */}
        {members.length === 0 ? (
          <div className="auth-note">
            No members yet — add one on the <b>Members</b> page to be able to name a team lead.
          </div>
        ) : (
          <>
            <Field label="Team lead" optional>
              {(id) => (
                <Select
                  id={id}
                  block
                  label="Team lead"
                  ariaLabel="Team lead"
                  value={lead}
                  options={[
                    { value: "", label: "— No lead —" },
                    ...members.map((m) => ({
                      value: m.name,
                      label: m.name + (m.title ? ` — ${m.title}` : ""),
                    })),
                  ]}
                  onChange={setLead}
                />
              )}
            </Field>
            {lead && <div className="field-hint">{lead} joins the team as a member.</div>}
          </>
        )}
        <div className="auth-note">Add more members to the team after creating it, from the Teams page.</div>
      </div>
    </Modal>
  );
}
