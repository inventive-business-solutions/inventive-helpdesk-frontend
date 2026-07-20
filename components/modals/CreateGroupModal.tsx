"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { TextField } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const groups = useStore((s) => s.groups);
  const addGroup = useStore((s) => s.addGroup);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const [name, setName] = useState("");
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
    run(() => addGroup(name.trim()), { success: `Team "${name.trim()}" added`, onSuccess: onClose });
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
        <div className="auth-note">Add members to the team after creating it, from the Teams page.</div>
      </div>
    </Modal>
  );
}
