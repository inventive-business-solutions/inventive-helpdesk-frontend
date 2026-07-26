"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Chips";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { isEmail, memberStatusTone } from "../../lib/helpers";
import type { TeamMember } from "../../types";

export function EditMemberModal({
  member,
  onClose,
  onDelete,
}: {
  member: TeamMember;
  onClose: () => void;
  /** Rendered as Delete in the footer. This is the manage view, so removing happens here
   *  — while looking at the record — rather than from a bare ✕ in a row. */
  onDelete?: () => void;
}) {
  const members = useStore((s) => s.members);
  const updateMember = useStore((s) => s.updateMember);
  const sendInvite = useStore((s) => s.sendInvite);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [name, setName] = useState(member.name);
  const [title, setTitle] = useState(member.title ?? "");
  const [email, setEmail] = useState(member.email === "—" ? "" : member.email);
  const [err, setErr] = useState<{ name?: boolean; email?: boolean }>({});
  const dirty =
    name !== member.name ||
    title !== (member.title ?? "") ||
    email !== (member.email === "—" ? "" : member.email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr({ name: true });
      return;
    }
    if (email.trim() && !isEmail(email)) {
      setErr({ email: true });
      toast("Enter a valid email address");
      return;
    }
    const renamed = name.trim().toLowerCase() !== member.name.toLowerCase();
    if (renamed && members.some((m) => m.name.toLowerCase() === name.trim().toLowerCase())) {
      setErr({ name: true });
      toast("A member with that name already exists");
      return;
    }
    run(() => updateMember(member.name, { name: name.trim(), title: title.trim(), email: email.trim() }), {
      success: `${name.trim()} updated`,
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      title={`Edit ${member.name}`}
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
                Remove member
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="modal-body">
        <div className="field-2">
          <TextField
            label="Full name"
            value={name}
            error={err.name}
            onChange={(v) => {
              setName(v);
              setErr((x) => ({ ...x, name: false }));
            }}
          />
          <TextField
            label="Title"
            optional
            value={title}
            placeholder="e.g. Support Engineer"
            onChange={setTitle}
          />
        </div>
        <TextField
          label="Email"
          optional
          type="email"
          value={email}
          error={err.email}
          placeholder="name@inventive.io"
          onChange={(v) => {
            setEmail(v);
            setErr((x) => ({ ...x, email: false }));
          }}
        />
        <div className="field">
          <div className="field-label">Portal access</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge tone={memberStatusTone(member.status)}>{member.status}</Badge>
            {member.email && member.email !== "—" ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(() => sendInvite(member.name), {
                    success: `Invite sent to ${member.email}`,
                    onSuccess: onClose,
                  })
                }
              >
                {member.status === "Invited" ? "Resend invite" : "Send invite"}
              </Button>
            ) : (
              <span className="muted">Add an email first to invite them.</span>
            )}
          </div>
        </div>
        <div className="auth-note">
          Renaming updates this member everywhere they're assigned — their tickets and teams.
        </div>
      </div>
    </Modal>
  );
}
