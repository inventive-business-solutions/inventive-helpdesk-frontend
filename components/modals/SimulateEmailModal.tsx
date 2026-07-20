"use client";
import { useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField, Field } from "../ui/Field";
import { ModalFooter } from "../ui/ModalFooter";
import { StagedFiles } from "./StagedFiles";
import { useStore } from "../../store";
import { useToast } from "../ui/Toast";
import { isEmail } from "../../lib/helpers";

// Sentinel for the "type any sender" option in the From dropdown.
const CUSTOM = "__custom__";
// Shown (read-only) as the recipient so the team sees that mail to the support inbox is
// what becomes a ticket. Display-only — the simulator posts the ticket directly, no SMTP.
const SUPPORT_INBOX = "support@inventivebizsol.com";

/**
 * Demo trigger for inbound email. In production this is replaced by the mail server /
 * Frappe Email Account calling the same `intakeEmail` intake logic — the ticket it
 * produces is identical, only the transport differs.
 */
export function SimulateEmailModal({ onClose }: { onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const intakeEmail = useStore((s) => s.intakeEmail);
  const sendMailpitTest = useStore((s) => s.sendMailpitTest);
  const toast = useToast();

  const senders = useMemo(
    () =>
      clients.flatMap((c) =>
        c.divisions.flatMap((d) =>
          d.pocs.map((p) => ({ email: p.email, label: `${p.name} — ${c.name} · ${d.name}` })),
        ),
      ),
    [clients],
  );

  const [from, setFrom] = useState(senders[0]?.email ?? CUSTOM);
  const [customEmail, setCustomEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [via, setVia] = useState<"direct" | "mailpit">("direct");
  const [err, setErr] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCustom = from === CUSTOM;
  const sender = isCustom ? customEmail.trim() : from;
  // A known POC's display name (nicer in Mailpit); custom senders go by their address.
  const senderName = isCustom ? undefined : senders.find((s) => s.email === from)?.label.split(" — ")[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let bad = false;
    if (isCustom && !isEmail(customEmail)) {
      setEmailErr(true);
      bad = true;
    }
    if (!subject.trim()) {
      setErr(true);
      bad = true;
    }
    if (bad) return;
    setSaving(true);
    try {
      if (via === "mailpit") {
        // Real pipeline: the server posts this into Mailpit, which captures it and fires the
        // webhook → a ticket appears here on the next auto-refresh.
        await sendMailpitTest({
          fromEmail: sender,
          fromName: senderName,
          subject: subject.trim(),
          body: body.trim(),
        });
        toast("Sent via Mailpit — watch it land in Mailpit, then appear here as a ticket.");
        onClose();
      } else {
        // Direct: skips Mailpit and creates the ticket immediately. Attachments are
        // filename-only here (real inbound attachments arrive via a Frappe Email Account).
        const { id, matched } = await intakeEmail({
          fromEmail: sender,
          subject: subject.trim(),
          body: body.trim(),
          attachments: files.map((f) => f.name),
        });
        toast(matched ? `Email received → ${id}` : `Email received → ${id} · unassigned, unknown sender`);
        onClose();
      }
    } catch (e) {
      toast(
        via === "mailpit"
          ? e instanceof Error && e.message
            ? e.message
            : "Could not send via Mailpit."
          : "Could not receive the email — please try again.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Simulate inbound email"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalFooter
          submitLabel={via === "mailpit" ? "Send via Mailpit" : "Receive email"}
          busyLabel="Sending…"
          busy={saving}
          onCancel={onClose}
        />
      }
    >
      <div className="modal-body">
        <Field label="Delivery">
          {(id) => (
            <Select
              id={id}
              block
              label="Delivery method"
              ariaLabel="Delivery method"
              value={via}
              options={[
                { value: "direct", label: "Create directly — instant, skips Mailpit" },
                { value: "mailpit", label: "Send via Mailpit — real inbox → webhook (team demo)" },
              ]}
              onChange={(v) => setVia(v as "direct" | "mailpit")}
            />
          )}
        </Field>
        <Field label="From">
          {(id) => (
            <Select
              id={id}
              block
              label="Select sender"
              ariaLabel="From"
              value={from}
              options={[
                ...senders.map((s) => ({ value: s.email, label: `${s.label} (${s.email})` })),
                { value: CUSTOM, label: "Custom address — type any sender…" },
              ]}
              onChange={(v) => {
                setFrom(v);
                setEmailErr(false);
              }}
            />
          )}
        </Field>

        {isCustom && (
          <TextField
            label="Sender email"
            value={customEmail}
            error={emailErr}
            placeholder="e.g. someone@acme.com — any address, real or fake"
            onChange={(v) => {
              setCustomEmail(v);
              if (emailErr) setEmailErr(false);
            }}
          />
        )}

        <Field label="To">
          {(id) => (
            <>
              <input
                id={id}
                value={SUPPORT_INBOX}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                title="Your support inbox — mail sent here becomes a ticket"
              />
              <div className="field-hint">Fixed — mail to your support inbox is what creates a ticket.</div>
            </>
          )}
        </Field>
        <TextField
          label="Subject"
          value={subject}
          error={err}
          placeholder="e.g. Export to Excel not working"
          onChange={(v) => {
            setSubject(v);
            if (err) setErr(false);
          }}
        />
        <Field label="Message">
          {(id) => (
            <textarea
              id={id}
              value={body}
              placeholder="The body of the client's email…"
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>
        {via === "direct" && (
          <div className="field">
            <div className="field-label">Attachments</div>
            <StagedFiles files={files} onChange={setFiles} label="Attach files to the email" />
          </div>
        )}
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Mail to your support inbox becomes a ticket, routed by the sender: a known POC auto-scopes to
            their Client · Division; any other address creates an unmatched, unassigned ticket for an agent to
            sort out.
          </div>
        </div>
      </div>
    </Modal>
  );
}
