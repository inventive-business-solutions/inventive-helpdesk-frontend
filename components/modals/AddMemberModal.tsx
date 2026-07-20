"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField, CheckboxField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail } from "../../lib/helpers";

export function AddMemberModal({ onClose }: { onClose: () => void }) {
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const addMember = useStore((s) => s.addMember);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState(true);
  const [group, setGroup] = useState("");
  const [err, setErr] = useState<{ name?: boolean; email?: boolean }>({});

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = { name: !name.trim(), email: !email.trim() };
    if (errs.name || errs.email) {
      setErr(errs);
      return;
    }
    if (members.some((m) => m.name.toLowerCase() === name.trim().toLowerCase())) {
      setErr({ name: true });
      toast("A member with that name already exists");
      return;
    }
    if (!isEmail(email)) {
      setErr({ email: true });
      toast("Enter a valid email address");
      return;
    }
    const success = group
      ? `Member ${name.trim()} added to ${group}`
      : invite
        ? `Member added — invite sent to ${email.trim()}`
        : `Member ${name.trim()} added`;
    run(() => addMember(name.trim(), email.trim(), title.trim(), invite, group || undefined), {
      success,
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      title="Add team member"
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalFooter submitLabel="Add member" busyLabel="Saving…" busy={busy} onCancel={onClose} />}
    >
      <div className="modal-body">
        <div className="field-2">
          <TextField
            label="Full name"
            value={name}
            error={err.name}
            placeholder="e.g. Rohan Kale"
            onChange={(v) => {
              setName(v);
              setErr((x) => ({ ...x, name: false }));
            }}
          />
          <TextField
            label="Title"
            optional
            value={title}
            placeholder="e.g. Software Dev"
            onChange={setTitle}
          />
        </div>
        <TextField
          label="Email"
          type="email"
          value={email}
          error={err.email}
          placeholder="name@inventive.io"
          onChange={(v) => {
            setEmail(v);
            setErr((x) => ({ ...x, email: false }));
          }}
        />
        {groups.length > 0 && (
          <Field label="Team" optional>
            {(id) => (
              <Select
                id={id}
                block
                label="— No team —"
                ariaLabel="Team"
                value={group}
                options={[
                  { value: "", label: "— No team —" },
                  ...groups.map((g) => ({ value: g.name, label: g.name })),
                ]}
                onChange={setGroup}
              />
            )}
          </Field>
        )}
        <CheckboxField checked={invite} onChange={setInvite}>
          Send an email invite to set up their password
        </CheckboxField>
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            With invite on, the member is marked <b>Invited</b> until they set a password. With it off they're
            <b> Not Invited</b> — send the invite later from their member card.
          </div>
        </div>
      </div>
    </Modal>
  );
}
