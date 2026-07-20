"use client";
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { useStore } from "../../store";
import { useSubmit } from "../ui/useSubmit";
import { EmptyState } from "../ui/EmptyState";

export function AddGroupMemberModal({ group, onClose }: { group: string; onClose: () => void }) {
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const addGroupMember = useStore((s) => s.addGroupMember);
  const { busy, run } = useSubmit();

  const current = groups.find((g) => g.name === group)?.members ?? [];
  const available = members.filter((m) => !current.includes(m.name));
  const [member, setMember] = useState(available[0]?.name ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    run(() => addGroupMember(group, member), { success: `${member} added to ${group}`, onSuccess: onClose });
  };

  return (
    <Modal
      title={`Add member to ${group}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel="Add member"
          busyLabel="Saving…"
          busy={busy}
          submitDisabled={!available.length}
          onCancel={onClose}
        />
      }
    >
      <div className="modal-body">
        {available.length ? (
          <Field label="Member">
            {(id) => (
              <Select
                id={id}
                block
                label="Select member"
                ariaLabel="Member"
                value={member}
                options={available.map((m) => ({
                  value: m.name,
                  label: m.name + (m.title ? ` — ${m.title}` : ""),
                }))}
                onChange={setMember}
              />
            )}
          </Field>
        ) : (
          <EmptyState compact>Everyone is already in this team.</EmptyState>
        )}
      </div>
    </Modal>
  );
}
