"use client";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, collabKey, mergeTicketDraft, type TicketDraft } from "@/store";
import { Button } from "@/components/ui/Button";
import { originFromUrl } from "@/components/ui/BackButton";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Segmented } from "@/components/ui/Segmented";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { Badge, IdChip, StatusPill, TypeTag } from "@/components/ui/Chips";
import { SenderBadge } from "@/components/ui/SenderBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { StagedFileChips } from "@/components/modals/StagedFiles";
import { availableProducts, fmtDateTime, fmtShortDate, fmtTime, initials, isResolved } from "@/lib/helpers";

/** Short, compact ticket timestamp for the rail: "12/07/2026, 9:00 AM". */
const stamp = (iso?: string) => (iso ? `${fmtShortDate(iso)}, ${fmtTime(iso)}` : "—");

import { useAutoRefresh, TICKET_POLL_MS } from "@/lib/useAutoRefresh";
import { onRealtime, subscribeDoc } from "@/lib/realtime";
import { attachmentHref } from "@/lib/frappe";
import { Popover, MenuList, type MenuOption } from "@/components/ui/Menu";
import { AttachmentPreview } from "@/components/ui/AttachmentPreview";
import { attachmentIcon, attachmentKind, canPreview, hasBlockingIssue, officeApp } from "@/lib/attachments";
import type {
  Activity,
  Attachment,
  Collaborator,
  Message,
  Priority,
  Status,
  Ticket,
  WorkNote,
} from "@/types";

const STATUSES: Status[] = [
  "New",
  "Acknowledged",
  "In Progress",
  "Pending Client",
  "Resolved",
  "Closed",
  "Reopened",
];
const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];

/** Phrase one activity row. The subject is the actor, rendered separately underneath,
 *  so each line reads as "<what happened>" under "<who> · <when>".
 *
 *  An Assignee row whose new value is the actor themselves is a self-assignment —
 *  api.claim_ticket deliberately writes no row of its own, so this is what makes a
 *  claim read as a claim rather than as somebody assigning themselves. */
function describeActivity(a: Activity) {
  switch (a.action) {
    case "Created":
      return (
        <>
          opened the ticket as <b>{a.to ?? "New"}</b>
        </>
      );
    case "Collaborator":
      return a.to ? (
        <>
          added <b>{a.to}</b> as a collaborator
        </>
      ) : (
        <>
          removed <b>{a.from}</b> as a collaborator
        </>
      );
    case "Assignee":
      if (a.to && a.to === a.author) return <>claimed the ticket</>;
      return a.to ? (
        <>
          assigned the ticket to <b>{a.to}</b>
        </>
      ) : (
        <>unassigned the ticket</>
      );
    case "Team":
      return (
        <>
          routed the ticket to <b>{a.to}</b>
        </>
      );
    default:
      return (
        <>
          changed {a.action.toLowerCase()} from <b>{a.from}</b> to <b>{a.to}</b>
        </>
      );
  }
}

/**
 * One attachment, and what can be done with it.
 *
 * This used to be a bare link carrying BOTH `target="_blank"` and `download`. For a
 * same-origin link `download` wins, so every attachment downloaded — a screenshot, a PDF and
 * a spreadsheet all behaved identically, and viewing one meant finding it on disk afterwards.
 * Nothing about the file pipeline required that: Frappe already serves these inline-capable.
 *
 * The menu is per-type, with the useful action first. Office files keep downloading, because
 * a browser cannot render them and the honest fix is to say so — see the Office branch.
 */
function AttachChip({ att, onPreview }: { att: Attachment; onPreview: (a: Attachment) => void }) {
  const href = attachmentHref(att.url);
  const kind = attachmentKind(att.name);
  const app = officeApp(att.name);

  const options: MenuOption[] = [];
  if (canPreview(att.name)) {
    options.push({
      value: "preview",
      label: kind === "video" ? "Play here" : "Preview here",
    });
    options.push({ value: "tab", label: "Open in new tab" });
  } else if (kind === "office") {
    // Deliberately NOT an "open in Microsoft 365" link. The Office web viewer fetches the
    // file from Microsoft's servers, and these are private, session-gated files on our own
    // domain — Microsoft cannot reach them, so such a link would only ever show an error.
    // Making it work means publishing the file behind a signed public URL, which is a
    // decision about client data and not one this menu should quietly take.
    options.push({ value: "download", label: `Download and open in ${app ?? "its app"}` });
  } else {
    options.push({ value: "download", label: "Download" });
  }
  if (!options.some((o) => o.value === "download")) options.push({ value: "download", label: "Download" });

  const act = (value: string) => {
    if (value === "preview") return onPreview(att);
    const a = document.createElement("a");
    a.href = href;
    if (value === "download") a.download = att.name;
    else {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.click();
  };

  return (
    <Popover
      ariaLabel={`Actions for ${att.name}`}
      minWidth={196}
      trigger={({ ref, onClick, open }) => (
        <button
          type="button"
          ref={ref}
          onClick={onClick}
          className={`attach ${open ? "open" : ""}`.trim()}
          title={att.name}
        >
          <Icon name={attachmentIcon(att.name)} size={14} />
          {att.name}
          <Icon name="chevronDown" size={11} className="attach-caret" />
        </button>
      )}
    >
      {({ close }) => (
        <MenuList
          options={options}
          onSelect={(v) => {
            act(v);
            close();
          }}
        />
      )}
    </Popover>
  );
}

function AttachChips({ list, onPreview }: { list?: Attachment[]; onPreview: (a: Attachment) => void }) {
  if (!list || !list.length) return null;
  return (
    <div className="d-attach" style={{ marginTop: 8 }}>
      {list.map((a, i) =>
        a.url ? (
          <AttachChip att={a} onPreview={onPreview} key={`${a.name}-${i}`} />
        ) : (
          // No URL means the upload never completed. Nothing to open, so no menu — the chip
          // is a record that something was meant to be here.
          <span className="attach" key={`${a.name}-${i}`}>
            <Icon name="paperclip" size={14} />
            {a.name}
          </span>
        ),
      )}
    </div>
  );
}

/** What happens to a reply, and the only choice the agent actually has.
 *
 *  Module scope, not declared inside TicketDetail: a component created during render is a
 *  new type on every pass, so React remounts it and the checkbox loses focus mid-click.
 *
 *  States the outcome rather than showing a bare switch, because the toggle does not
 *  always apply — it is ignored for a sender with no portal, and the FIRST reply to a
 *  registered user goes out even with it off. A switch that silently does nothing is worse
 *  than no switch. The server (sender.reply_plan) is the enforcer; this only sets
 *  expectations. */
function EmailChoice({
  ticket,
  canChoose,
  unreachable,
  emailReply,
  onChange,
  willEmail,
}: {
  ticket: Ticket;
  canChoose: boolean;
  unreachable: boolean;
  emailReply: boolean;
  onChange: (v: boolean) => void;
  willEmail: boolean;
}) {
  if (unreachable)
    return (
      <span className="email-choice danger" title={ticket.noReplyReason}>
        <Icon name="alert" size={13} />
        No-reply address — this will not reach anyone
      </span>
    );
  if (!canChoose)
    return (
      <span className="email-choice fixed">
        <Icon name="mail" size={13} />
        Will be emailed to {ticket.fromEmail ?? "the client"} — their only channel
      </span>
    );
  return (
    <label className="email-choice">
      <input type="checkbox" checked={emailReply} onChange={(e) => onChange(e.target.checked)} />
      Send reply over email
      {!emailReply && willEmail ? (
        <span className="email-choice-note">first reply — sent once regardless</span>
      ) : null}
    </label>
  );
}

export function TicketDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const session = useStore((s) => s.session);
  const booted = useStore((s) => s.booted);
  const groups = useStore((s) => s.groups);
  const members = useStore((s) => s.members);
  const ticket = useStore((s) => s.tickets.find((t) => t.id === id));
  const clients = useStore((s) => s.clients);
  const loadTicket = useStore((s) => s.loadTicket);
  const markRead = useStore((s) => s.markRead);
  const setStatus = useStore((s) => s.setStatus);
  const setPriority = useStore((s) => s.setPriority);
  const setTicketProduct = useStore((s) => s.setTicketProduct);
  const setAssignment = useStore((s) => s.setAssignment);
  const claimTicket = useStore((s) => s.claimTicket);
  const addCollaborator = useStore((s) => s.addCollaborator);
  const removeCollaborator = useStore((s) => s.removeCollaborator);
  const reopen = useStore((s) => s.reopen);
  const addMessage = useStore((s) => s.addMessage);
  const addNote = useStore((s) => s.addNote);
  const { busy, run } = useSubmit();

  const isAdmin = session?.role === "admin";
  // Back returns to wherever you actually came from (Dashboard, a team queue, search, …)
  // via real browser history — same as the browser's Back. Only when the tab has no
  // previous entry (a deep-linked ticket URL opened in a fresh tab) do we fall back to the
  // section list. `window.history.length > 1` is the App-Router-safe "is there somewhere to
  // go back to" check (App Router doesn't expose a history index like Pages Router did).
  // Stated, not inferred. `router.back()` used to be close enough here, but it lands
  // somewhere different depending on how you arrived, and once the list pages grew their
  // own Back the two mirrored each other into a loop. The list now passes its full filtered
  // URL as `from`, so this returns to the exact view the ticket was opened from — which
  // browser history gave us by accident and this gives us on purpose.
  const backTo = isAdmin ? "/tickets" : "/portal";
  const doBack = () => router.push(originFromUrl() ?? backTo);

  const [streamTab, setStreamTab] = useState<"client" | "internal" | "activity">("client");
  const [vis, setVis] = useState<"internal" | "client">("internal");
  // The "Send reply over email" toggle. Only meaningful for a registered user — everyone
  // else has no portal to read a reply in, so the server emails regardless (reply_plan).
  const [emailReply, setEmailReply] = useState(true);
  // Whether the agent gets a choice about email. Mirrors sender.reply_plan, but the server
  // is the enforcer — this only decides what to render and what to promise.
  const senderKind = ticket?.senderKind;
  const canChooseEmail = senderKind === "Registered";
  const unreachable = senderKind === "No Reply";
  const willEmail = !unreachable && (!canChooseEmail || emailReply || !ticket?.firstResponseEmailedOn);
  const [text, setText] = useState("");
  /** The attachment being viewed, or null. Held here rather than per-chip so only one
   *  preview can be open at a time — three chip lists render on this page. */
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Staff edit Team / Assignee / Priority / Status here as a *draft* — nothing is
  // written until the Update button is pressed, instead of auto-saving each change.
  const [draft, setDraft] = useState({
    group: ticket?.group ?? "",
    assignee: ticket?.assignee ?? "Unassigned",
    priority: (ticket?.priority ?? "Medium") as Priority,
    status: (ticket?.status ?? "New") as Status,
    // Emailed-in tickets arrive with no product; tagging one is a triage action, so it
    // stages with the other edits rather than saving on change.
    product: ticket?.product ?? "",
    collaborators: (ticket?.collaborators ?? []) as Collaborator[],
  });
  // Pending navigation held while we ask whether to save/discard unsaved edits
  // ("__back__" = the Back button; otherwise a destination path).
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  // Both internal streams are staff-only. A client never renders the tab strip, and
  // this collapses them to the client thread anyway so no state can strand them on a
  // tab with nothing behind it (their `activity`/`notes` come back empty regardless).
  const showStream = useMemo(
    () => (streamTab !== "client" && isAdmin ? streamTab : "client"),
    [streamTab, isAdmin],
  );

  // The list fetch omits conversation/notes for scale — pull the full document
  // (incl. child tables) once the app has booted, and whenever the id changes.
  // `detailLoaded` gates the thread UI so we show "Loading…" instead of a
  // premature "No messages yet.", and block sending until the full thread is in.
  const [detailLoaded, setDetailLoaded] = useState(false);
  useEffect(() => {
    setDetailLoaded(false);
    if (!booted) return;
    let alive = true;
    loadTicket(id)
      .catch(() => {})
      .finally(() => {
        if (alive) setDetailLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [id, booted, loadTicket]);

  // Re-sync the draft to the ticket's server values whenever they actually change
  // (initial load, our own save landing, or another user's edit). The per-field merge —
  // and why a blanket overwrite was a bug — lives in mergeTicketDraft.
  const collabServerKey = collabKey(ticket?.collaborators ?? []);
  // Sole owner of this ref, deliberately: touching it from the id-change effect as well
  // trips react-hooks/immutability. It carries the id so switching tickets can't have the
  // new ticket's values read as your unsaved edits — a mismatched id means "first sync".
  const syncedRef = useRef<{ id: string; vals: TicketDraft } | null>(null);
  useEffect(() => {
    if (!ticket) return;
    const server: TicketDraft = {
      group: ticket.group ?? "",
      assignee: ticket.assignee,
      priority: ticket.priority,
      status: ticket.status,
      product: ticket.product ?? "",
      collaborators: ticket.collaborators,
    };
    const last = syncedRef.current?.id === id ? syncedRef.current.vals : null;
    syncedRef.current = { id, vals: server };
    setDraft((d) => mergeTicketDraft(d, last, server));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.group, ticket?.assignee, ticket?.priority, ticket?.status, collabServerKey]);

  // Unsaved staff edits staged in the rail (admin only) — assignment, priority/status,
  // and now collaborators, all committed together via "Update ticket".
  const draftCollabKey = collabKey(draft.collaborators);
  const dirty =
    !!ticket &&
    isAdmin &&
    (draft.group !== (ticket.group ?? "") ||
      draft.assignee !== ticket.assignee ||
      draft.priority !== ticket.priority ||
      draft.status !== ticket.status ||
      draftCollabKey !== collabServerKey);

  // Guarded navigation: with unsaved staged edits, ask to save/discard before leaving.
  const executeLeave = (dest: string | null) => {
    if (!dest || dest === "__back__") doBack();
    else router.push(dest);
  };
  const goBack = () => {
    if (dirty) setLeaveTo("__back__");
    else doBack();
  };

  // Warn before leaving with unsaved edits: the browser Back/refresh/close (native
  // beforeunload) and in-app link clicks (captured, then routed through the prompt).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const dest = new URL(a.href, window.location.href);
      if (dest.origin !== window.location.origin) return; // external → beforeunload covers it
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(dest.pathname + dest.search + dest.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // Keep the open thread live: re-pull the full ticket (conversation + notes) on the
  // same visibility-gated cadence, once the initial load is in (so we don't double-fetch
  // on mount). Two safety nets so a background refresh never disturbs your work:
  //  1) skip entirely while you're composing (draft text) or sending — no reflow mid-type;
  //  2) `guarded` (+ the API mutation tracker) discards any refresh that raced a save.
  // The reply draft lives in local state regardless, so it's never re-fetched away.
  useAutoRefresh(
    () => (text.trim() || sending || dirty ? undefined : loadTicket(id, true)),
    TICKET_POLL_MS,
    booted && detailLoaded,
  );

  // Live: join this ticket's doc room and re-pull it the instant it changes elsewhere
  // (a teammate claims it, posts a note, flips status). The poller above is the fallback
  // when the socket is down, and this mirrors its guards deliberately: `guarded` only
  // discards a refresh that raced a SAVE (store.loadTicket checks api.isMutating), so
  // skipping while you're composing or holding unsaved edits has to happen here. Read
  // skipping while you're composing or holding unsaved edits has to happen here. The
  // listener is registered once per ticket, so it needs useEffectEvent to see the current
  // compose/dirty state rather than the values from the render that registered it.
  const refreshIfIdle = useEffectEvent(() => {
    if (text.trim() || sending || dirty) return;
    void loadTicket(id, true).catch(() => {});
  });
  useEffect(() => {
    if (!booted || !detailLoaded) return;
    const leave = subscribeDoc("Support Ticket", id);
    const off = onRealtime<{ name: string }>("ticket_update", (d) => {
      if (d?.name === id) refreshIfIdle();
    });
    return () => {
      off();
      leave();
    };
  }, [booted, detailLoaded, id, loadTicket]);

  // Opening a ticket clears THIS agent's unread marker for it — not the team's. Runs on
  // every re-pull too, so a reply that lands while you're reading the ticket doesn't
  // leave the dot behind when you navigate away.
  useEffect(() => {
    if (!booted || !detailLoaded || !isAdmin) return;
    void markRead(id);
  }, [booted, detailLoaded, id, isAdmin, markRead, ticket?.updatedISO]);

  if (!ticket || !session) {
    return (
      <>
        <div className="page-head">
          <Button variant="ghost" icon={<Icon name="arrowLeft" size={16} />} onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="card">
          <EmptyState>Ticket not found.</EmptyState>
        </div>
      </>
    );
  }

  // A member is only assignable within its team, so the picker is scoped to the
  // chosen team's members — and empty (locked) until a team is set. The current
  // assignee is always kept selectable so it still renders.
  const groupMemberNames = draft.group ? (groups.find((g) => g.name === draft.group)?.members ?? []) : [];
  const assigneeOptions = Array.from(
    new Set([...groupMemberNames, ...(draft.assignee !== "Unassigned" ? [draft.assignee] : [])]),
  );

  // Claim: an agent can pick up a ticket sitting unclaimed in one of their teams' queues.
  const myTeams = session.teams ?? [];
  const canClaim =
    isAdmin && !!ticket.group && myTeams.includes(ticket.group) && ticket.assignee === "Unassigned";

  // Collaborators are part of the staged draft — add/remove mutate `draft.collaborators`
  // and only persist when "Update ticket" is pressed. Options exclude the (draft) owning
  // team, the (draft) assignee, and anyone already staged; two pickers so neither is huge.
  const collabKeys = new Set(draft.collaborators.map((c) => `${c.partyType}:${c.party}`));
  const teamCollabOpts = [
    { value: "", label: "Add a team…" },
    ...groups
      .filter((g) => g.name !== draft.group && !collabKeys.has(`Team:${g.name}`))
      .map((g) => ({ value: g.name, label: g.name })),
  ];
  const memberCollabOpts = [
    { value: "", label: "Add a member…" },
    ...members
      .filter((m) => m.name !== draft.assignee && !collabKeys.has(`Member:${m.name}`))
      .map((m) => ({ value: m.name, label: m.name })),
  ];
  const onAddCollab = (partyType: "Team" | "Member", party: string) => {
    if (!party || collabKeys.has(`${partyType}:${party}`)) return;
    setDraft((d) => ({ ...d, collaborators: [...d.collaborators, { partyType, party }] }));
  };
  const onRemoveCollaborator = (c: Collaborator) =>
    setDraft((d) => ({
      ...d,
      collaborators: d.collaborators.filter((x) => !(x.partyType === c.partyType && x.party === c.party)),
    }));

  // What this ticket may legitimately be tagged with — the same set the raise dialog
  // offers, and the same the backend validates against.
  const productChoices = availableProducts(clients, ticket);

  const serverVals = {
    group: ticket.group ?? "",
    assignee: ticket.assignee,
    priority: ticket.priority,
    status: ticket.status,
    product: ticket.product ?? "",
    collaborators: ticket.collaborators,
  };
  // The writes needed to persist the staged draft (only the changed fields + collaborator
  // adds/removes). Kept as a builder so both "Update ticket" and "Save & leave" reuse it.
  const buildSaveCalls = () => {
    const calls: Array<() => Promise<unknown>> = [];
    if (draft.group !== serverVals.group || draft.assignee !== serverVals.assignee)
      calls.push(() => setAssignment(ticket.id, draft.group, draft.assignee));
    if (draft.priority !== serverVals.priority) calls.push(() => setPriority(ticket.id, draft.priority));
    if (draft.status !== serverVals.status) calls.push(() => setStatus(ticket.id, draft.status));
    if (draft.product !== serverVals.product) calls.push(() => setTicketProduct(ticket.id, draft.product));
    const serverKeys = new Set(ticket.collaborators.map((c) => `${c.partyType}:${c.party}`));
    const draftKeys = new Set(draft.collaborators.map((c) => `${c.partyType}:${c.party}`));
    for (const c of draft.collaborators)
      if (!serverKeys.has(`${c.partyType}:${c.party}`))
        calls.push(() => addCollaborator(ticket.id, c.partyType, c.party));
    for (const c of ticket.collaborators)
      if (!draftKeys.has(`${c.partyType}:${c.party}`))
        calls.push(() => removeCollaborator(ticket.id, c.partyType, c.party));
    return calls;
  };
  const persist = async () => {
    for (const c of buildSaveCalls()) await c();
  };
  const saveChanges = () => {
    if (!dirty) return;
    run(persist, { success: "Ticket updated" });
  };

  const send = async () => {
    if ((!text.trim() && files.length === 0) || sending) return;
    const staged = files.slice();
    const now = fmtDateTime(new Date());
    const nFiles = staged.length ? ` · ${staged.length} file${staged.length > 1 ? "s" : ""}` : "";
    setSending(true);
    try {
      if (session.role === "client") {
        const msg: Message = {
          kind: "client",
          author: session.name,
          role: "Client",
          tm: now,
          body: text.trim(),
        };
        await addMessage(ticket.id, msg, staged);
        toast(`Reply sent${nFiles}`);
      } else if (vis === "internal") {
        const note: WorkNote = { author: session.name, tm: now, body: text.trim() };
        await addNote(ticket.id, note, staged);
        toast(`Internal note added — not visible to client${nFiles}`);
      } else {
        const msg: Message = {
          kind: "team",
          author: session.name,
          role: "Team → Client",
          tm: now,
          body: text.trim(),
        };
        const res = await addMessage(ticket.id, msg, staged, canChooseEmail ? emailReply : undefined);
        setStreamTab("client");
        // Report the server's decision, not the toggle's position — they differ by design
        // for the first reply and for senders with no portal.
        toast(
          res.emailed
            ? `Reply sent and emailed${nFiles}`
            : `Reply saved to the thread — not emailed${nFiles}`,
        );
      }
      setText("");
      setFiles([]);
    } catch {
      toast("Could not send — please try again.");
    } finally {
      setSending(false);
    }
  };

  // Client confirms a resolved ticket — posts a real confirmation message
  // (visible to the team) rather than a fake toast.
  const confirmResolved = () =>
    run(
      () =>
        addMessage(ticket.id, {
          kind: "client",
          author: session.name,
          role: "Client",
          tm: fmtDateTime(new Date()),
          body: "Confirmed — this is resolved on our side. Thank you!",
          attachments: [],
        }),
      { success: "Thanks — we've noted your confirmation" },
    );

  return (
    <>
      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-body d-head">
              <div className="d-head-top">
                {/* Back control lives inline with the title — no separate top bar. */}
                <IconButton icon={<Icon name="arrowLeft" />} label="Back" onClick={goBack} />
                <h2 className="d-title">{ticket.title}</h2>
                {/* Ticket ID, then Status, then the ticket Type — grouped top-right. */}
                <div className="d-badges">
                  <IdChip id={ticket.id} lg />
                  <StatusPill status={ticket.status} lg />
                  <TypeTag type={ticket.type} lg />
                </div>
              </div>
              {/* Staff only: clients have no use for their own classification, and
                  "Unregistered sender" is meaningless read by the sender. */}
              {isAdmin ? <SenderBadge ticket={ticket} /> : null}
              <div className="d-desc">{ticket.desc}</div>
              <AttachChips list={ticket.attachments} onPreview={setPreview} />
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              {isAdmin ? (
                <Segmented
                  fullWidth
                  ariaLabel="Conversation stream"
                  options={[
                    {
                      key: "client",
                      label: "Client conversation",
                      icon: <Icon name="chat" />,
                      count: ticket.conversation.length,
                    },
                    {
                      key: "internal",
                      label: "Work notes (internal)",
                      icon: <Icon name="lock" />,
                      count: ticket.notes.length,
                    },
                    {
                      key: "activity",
                      label: "Activity",
                      icon: <Icon name="clock" />,
                      count: ticket.activity.length,
                    },
                  ]}
                  value={showStream}
                  onChange={setStreamTab}
                />
              ) : (
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Conversation
                </div>
              )}

              <div className="stream-scroll">
                {showStream === "client" ? (
                  ticket.conversation.length ? (
                    ticket.conversation.map((m, i) => (
                      <div className="msg" key={`${m.tm}-${i}`}>
                        <div className={`av ${m.kind}`}>{initials(m.author)}</div>
                        <div className="body">
                          <div className="mh">
                            <span className="nm">{m.author}</span>
                            <Badge sm tone={m.kind === "client" ? "good" : "accent"}>
                              {m.role}
                            </Badge>
                            <span className="tm">{m.tm}</span>
                          </div>
                          <div className="tx">{m.body}</div>
                          <AttachChips list={m.attachments} onPreview={setPreview} />
                        </div>
                      </div>
                    ))
                  ) : !detailLoaded ? (
                    <EmptyState compact>Loading…</EmptyState>
                  ) : (
                    <EmptyState compact icon="chat">
                      No messages yet.
                    </EmptyState>
                  )
                ) : showStream === "internal" ? (
                  <div className="notes-panel internal">
                    <div className="internal-banner">
                      <Icon name="lock" size={14} />
                      Internal only — never shown to the client
                    </div>
                    {ticket.notes.length ? (
                      ticket.notes.map((n, i) => (
                        <div className="msg" key={`${n.tm}-${i}`}>
                          <div className="av team">{initials(n.author)}</div>
                          <div className="body">
                            <div className="mh">
                              <span className="nm">{n.author}</span>
                              <Badge sm tone="warning">
                                Internal
                              </Badge>
                              <span className="tm">{n.tm}</span>
                            </div>
                            <div className="tx">{n.body}</div>
                            <AttachChips list={n.attachments} onPreview={setPreview} />
                          </div>
                        </div>
                      ))
                    ) : !detailLoaded ? (
                      <EmptyState compact>Loading…</EmptyState>
                    ) : (
                      <EmptyState compact icon="lock">
                        No internal notes yet.
                      </EmptyState>
                    )}
                  </div>
                ) : (
                  <div className="notes-panel internal">
                    <div className="internal-banner">
                      <Icon name="lock" size={14} />
                      Internal only — never shown to the client
                    </div>
                    {ticket.activity.length ? (
                      <ol className="activity-log">
                        {ticket.activity.map((a, i) => (
                          <li className="act" key={`${a.tm}-${i}`}>
                            <span className="act-dot" aria-hidden="true" />
                            <div className="act-body">
                              <div className="act-line">{describeActivity(a)}</div>
                              <div className="act-meta">
                                {a.author} · {a.tm}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : !detailLoaded ? (
                      <EmptyState compact>Loading…</EmptyState>
                    ) : (
                      <EmptyState compact icon="clock">
                        No activity recorded yet.
                      </EmptyState>
                    )}
                  </div>
                )}
              </div>

              {/* The activity log is written by the server, never typed into — so the
                  composer would be a control that cannot act on what is on screen. */}
              {showStream !== "activity" && (
                <div className="composer">
                  <textarea
                    value={text}
                    placeholder={
                      !isAdmin
                        ? "Reply to the Inventive team…"
                        : vis === "internal"
                          ? "Write an internal work note…"
                          : "Write a reply to the client…"
                    }
                    onChange={(e) => setText(e.target.value)}
                  />
                  <StagedFileChips
                    files={files}
                    onRemove={(i) => setFiles(files.filter((_, idx) => idx !== i))}
                  />
                  <div className="composer-bar">
                    {isAdmin && (
                      <div className="vis-toggle">
                        <button
                          className={`vis-opt ${vis === "internal" ? "on-internal" : ""}`}
                          onClick={() => setVis("internal")}
                        >
                          <Icon name="lock" size={13} />
                          Internal note
                        </button>
                        <button
                          className={`vis-opt ${vis === "client" ? "on-client" : ""}`}
                          onClick={() => setVis("client")}
                        >
                          <Icon name="chat" size={13} />
                          Reply to client
                        </button>
                      </div>
                    )}
                    {isAdmin && vis === "client" ? (
                      <EmailChoice
                        ticket={ticket}
                        canChoose={canChooseEmail}
                        unreachable={unreachable}
                        emailReply={emailReply}
                        onChange={setEmailReply}
                        willEmail={willEmail}
                      />
                    ) : null}
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
                        e.target.value = "";
                      }}
                    />
                    <IconButton
                      icon={<Icon name="paperclip" />}
                      label="Attach files"
                      onClick={() => fileRef.current?.click()}
                    />
                    {!isAdmin && (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon name="chat" size={13} />
                        Visible to the Inventive team
                      </span>
                    )}
                    <button
                      type="button"
                      className={`btn send-btn ${isAdmin && vis === "internal" ? "" : "primary"}`}
                      style={
                        isAdmin && vis === "internal"
                          ? { background: "var(--warning)", color: "#fff", borderColor: "var(--warning)" }
                          : undefined
                      }
                      onClick={send}
                      // Blocked on an over-cap file: the server would refuse the upload
                      // anyway, and finding that out after writing the reply is the worst
                      // moment to learn it. The notice under the chips says which file.
                      disabled={sending || !detailLoaded || hasBlockingIssue(files)}
                    >
                      {sending
                        ? "Sending…"
                        : !isAdmin
                          ? "Send reply"
                          : vis === "internal"
                            ? "Add work note"
                            : "Send to client"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="rail">
          <div className="card">
            <div className="card-head">
              <h3>Details</h3>
            </div>
            <div className="card-body">
              <div className="meta-group">
                <div className="meta-row">
                  <span className="mk">Client</span>
                  <span className="mv">{ticket.client}</span>
                </div>
                <div className="meta-row">
                  <span className="mk">Division</span>
                  <span className="mv">{ticket.div}</span>
                </div>
                <div className="meta-row">
                  <span className="mk">Product</span>
                  {/* Staff can tag an emailed-in ticket here — it arrives with none, and
                      this is the triage step. Options are only what the client runs at this
                      division, which is exactly what the backend will accept. Read-only for
                      a client: they chose it when raising, and it is not theirs to reassign. */}
                  {isAdmin && productChoices.length ? (
                    <span className="mv">
                      <Select
                        label="Set product"
                        ariaLabel="Product"
                        value={draft.product}
                        options={[
                          { value: "", label: "— Not classified —" },
                          ...productChoices.map((p) => ({ value: p, label: p })),
                        ]}
                        onChange={(v) => setDraft({ ...draft, product: v })}
                      />
                    </span>
                  ) : (
                    <span className="mv" title={ticket.product || undefined}>
                      {ticket.product || "—"}
                    </span>
                  )}
                </div>
                <div className="meta-row">
                  <span className="mk">Raised by</span>
                  <span className="mv">{ticket.raisedBy}</span>
                </div>
              </div>
              <div className="meta-group">
                <div className="meta-row">
                  <span className="mk">Created</span>
                  <span className="mv mv-time">{stamp(ticket.createdISO)}</span>
                </div>
                <div className="meta-row">
                  <span className="mk">Updated</span>
                  <span className="mv mv-time">{stamp(ticket.updatedISO)}</span>
                </div>
              </div>
              {isAdmin ? (
                <div className="meta-group">
                  {canClaim && (
                    <div className="claim-cta">
                      <Button
                        variant="primary"
                        icon={<Icon name="check" size={15} />}
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() =>
                          run(() => claimTicket(ticket.id), { success: "Claimed — assigned to you" })
                        }
                        disabled={busy}
                      >
                        Claim this ticket
                      </Button>
                      <p className="rail-hint">It's in your team's queue — claim it to take ownership.</p>
                    </div>
                  )}
                  <div className="rail-2col">
                    <div className="rail-field">
                      <label>Team</label>
                      <Select
                        block
                        label="Team"
                        ariaLabel="Team"
                        value={draft.group || "—"}
                        options={[
                          { value: "—", label: "Unassigned" },
                          ...groups.map((g) => ({ value: g.name, label: g.name })),
                        ]}
                        onChange={(v) => {
                          const newGroup = v === "—" ? "" : v;
                          // Keep the member only if they belong to the new team; otherwise unassign.
                          const newMembers = newGroup
                            ? (groups.find((g) => g.name === newGroup)?.members ?? [])
                            : [];
                          const keepAssignee =
                            draft.assignee !== "Unassigned" && newMembers.includes(draft.assignee)
                              ? draft.assignee
                              : "Unassigned";
                          setDraft((d) => ({ ...d, group: newGroup, assignee: keepAssignee }));
                        }}
                      />
                    </div>
                    <div className="rail-field">
                      <label>Assigned to</label>
                      <Select
                        block
                        label="Assignee"
                        ariaLabel="Assigned to"
                        value={draft.assignee}
                        disabled={!draft.group}
                        options={[
                          ...assigneeOptions.map((m) => ({ value: m, label: m })),
                          { value: "Unassigned", label: "Unassigned" },
                        ]}
                        onChange={(v) => setDraft((d) => ({ ...d, assignee: v }))}
                      />
                    </div>
                  </div>
                  {!draft.group && (
                    <p className="rail-hint" style={{ marginTop: 0 }}>
                      Pick a team first — members are assigned within their team.
                    </p>
                  )}
                  <div className="rail-2col">
                    <div className="rail-field">
                      <label>Priority</label>
                      <Select
                        block
                        label="Priority"
                        ariaLabel="Priority"
                        value={draft.priority}
                        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                        onChange={(v) => setDraft((d) => ({ ...d, priority: v as Priority }))}
                      />
                    </div>
                    <div className="rail-field">
                      <label>Status</label>
                      <Select
                        block
                        label="Status"
                        ariaLabel="Status"
                        value={draft.status}
                        options={STATUSES.map((st) => ({ value: st, label: st }))}
                        onChange={(v) => setDraft((d) => ({ ...d, status: v as Status }))}
                      />
                    </div>
                  </div>
                  <div className="rail-field">
                    <label>Collaborators</label>
                    {draft.collaborators.length > 0 ? (
                      <div className="collab-list">
                        {draft.collaborators.map((c) => (
                          <span className="collab-chip" key={`${c.partyType}:${c.party}`}>
                            <Icon name={c.partyType === "Team" ? "grid" : "user"} size={13} />
                            <span className="collab-name">{c.party}</span>
                            <button
                              type="button"
                              className="collab-x"
                              aria-label={`Remove ${c.party}`}
                              onClick={() => onRemoveCollaborator(c)}
                            >
                              <Icon name="x" size={12} strokeWidth={2.5} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="collab-empty">No collaborators yet.</p>
                    )}
                    <div className="collab-add">
                      <Select
                        block
                        label="Add a team…"
                        ariaLabel="Add a team as collaborator"
                        value=""
                        options={teamCollabOpts}
                        onChange={(v) => onAddCollab("Team", v)}
                      />
                      <Select
                        block
                        label="Add a member…"
                        ariaLabel="Add a member as collaborator"
                        value=""
                        options={memberCollabOpts}
                        onChange={(v) => onAddCollab("Member", v)}
                      />
                    </div>
                    <p className="rail-hint" style={{ marginTop: 2 }}>
                      They can view this ticket and post internal notes — saved when you press Update.
                    </p>
                  </div>
                  {/* Explicit save — nothing is written until this is pressed. */}
                  <div className="rail-actions">
                    {dirty && (
                      <Button variant="ghost" onClick={() => setDraft(serverVals)} disabled={busy}>
                        Discard
                      </Button>
                    )}
                    <Button variant="primary" onClick={saveChanges} disabled={!dirty || busy}>
                      {busy ? "Saving…" : "Update ticket"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="meta-group">
                  <div className="meta-row">
                    <span className="mk">Assigned to</span>
                    {/* Clients see the named owner (their point of contact); the list omits it.
                        Status lives only in the header chip; Priority is kept here as well. */}
                    <span className={`mv${ticket.assignee === "Unassigned" ? " muted" : ""}`}>
                      {ticket.assignee}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="mk">Priority</span>
                    <span className="mv">{ticket.priority}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body" style={{ padding: "14px 16px" }}>
              <div className={`sla ${ticket.slaRisk ? "risk" : "ok"}`}>
                <Icon name="clock" size={16} />
                {ticket.slaRisk ? `SLA at risk · due ${ticket.due}` : `On track · due ${ticket.due}`}
              </div>
            </div>
          </div>

          {session.role === "client" && isResolved(ticket.status) && (
            <div className="card">
              <div className="card-body" style={{ display: "flex", gap: 10 }}>
                <Button variant="primary" style={{ flex: 1 }} onClick={confirmResolved}>
                  Confirm resolved
                </Button>
                <Button onClick={() => run(() => reopen(ticket.id), { success: "Ticket reopened" })}>
                  Reopen
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {preview && <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}

      {leaveTo !== null && (
        <AlertDialog
          tone="warning"
          title="Unsaved changes"
          message="You have unsaved changes to this ticket. Save them before leaving?"
          onDismiss={() => setLeaveTo(null)}
          disableDismiss={busy}
          actions={
            <>
              <Button variant="ghost" onClick={() => setLeaveTo(null)} disabled={busy}>
                Keep editing
              </Button>
              <Button
                variant="ghost"
                danger
                onClick={() => {
                  const d = leaveTo;
                  setLeaveTo(null);
                  executeLeave(d);
                }}
                disabled={busy}
              >
                Leave without saving
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const d = leaveTo;
                  run(persist, {
                    success: "Ticket updated",
                    onSuccess: () => {
                      setLeaveTo(null);
                      executeLeave(d);
                    },
                  });
                }}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save & leave"}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
