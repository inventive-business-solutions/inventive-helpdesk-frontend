"use client";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { attachmentHref } from "@/lib/frappe";
import { attachmentKind } from "@/lib/attachments";
import type { Attachment } from "@/types";

/**
 * View an attachment without leaving the ticket.
 *
 * Only ever opened for kinds `canPreview` allows — image, pdf, video. That check is not
 * repeated here on purpose: one module decides what may render inline, and a second opinion
 * is a second thing to keep in step. Notably .svg is NOT an image by that rule, because it
 * can carry script and rendering it on our origin would run it with the viewer's session.
 *
 * The file is fetched through the same permission-gated proxy path as the download link, so
 * previewing grants nothing a download would not have. A client cannot preview a file on a
 * ticket they cannot read — Frappe gates /private/files by the attached ticket.
 *
 * Modal's unsaved-changes guard listens for `input`/`change` events, and nothing here emits
 * either, so a preview closes on Escape immediately rather than asking to discard.
 */
export function AttachmentPreview({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const href = attachmentHref(attachment.url);
  const kind = attachmentKind(attachment.name);

  return (
    <Modal
      title={attachment.name}
      onClose={onClose}
      wide
      footer={
        // No wrapper: Modal already puts `footer` inside .modal-foot, which is the flex row.
        <>
          <a className="btn ghost" href={href} target="_blank" rel="noopener noreferrer">
            <Icon name="externalLink" size={15} />
            Open in new tab
          </a>
          {/* `download` forces a save even for types the browser could display, which is the
              whole point here — this is the deliberate "keep a copy" action, next to the two
              that view it. */}
          <a className="btn ghost" href={href} download={attachment.name}>
            <Icon name="download" size={15} />
            Download
          </a>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className={`att-view att-view-${kind}`}>
        {kind === "image" && (
          // Contained rather than stretched: a screenshot blown past its natural size to
          // fill the dialog is less readable than the same screenshot at 1:1.
          //
          // A plain <img>, and next/image would be wrong here rather than merely
          // unnecessary. The optimizer fetches the source from the Next SERVER, which has no
          // session cookie for a private, permission-gated Frappe file — every attachment
          // would 403. Same shape as why the Office web viewer cannot reach these files.
          // Dimensions are unknown ahead of time too, which next/image requires.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={attachment.name} />
        )}
        {kind === "pdf" && (
          // The browser's own PDF viewer, which brings paging, zoom, search and printing for
          // free. It renders inline because Frappe does not force-download PDFs — only
          // .svg/.html/.htm/.xml — so no header work is needed to make this display.
          <iframe src={href} title={attachment.name} />
        )}
        {kind === "video" && (
          // Seeking works because send_private_file responds with Accept-Ranges: bytes;
          // without range support the scrubber would be dead and only playback from 0 would
          // work. No autoplay: a ticket attachment should not start making noise on its own.
          <video src={href} controls preload="metadata" />
        )}
      </div>
    </Modal>
  );
}
