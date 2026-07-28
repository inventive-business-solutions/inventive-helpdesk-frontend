/**
 * What can we do with this attachment, and what must we refuse to do?
 *
 * All of it is decided from the FILE NAME, because an Attachment is only `{name, url}` —
 * the backend sends no MIME type and no size. That is fine: Frappe guesses the response's
 * Content-Type from the same filename (`send_private_file`), so the browser and this module
 * are reading the same evidence and cannot disagree about a file.
 *
 * Kept separate from the components so the policy is testable without a DOM — the rules
 * below are the security-relevant part of the feature, and a rule nobody can run is a rule
 * nobody can trust.
 */

/** Upload cap, mirroring `_MAX_ATTACHMENT_BYTES` in the backend's api.py. Duplicated
 *  deliberately: the browser has the size before the upload starts, and refusing there beats
 *  spending someone's bandwidth to be told no by the server. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = "image" | "pdf" | "video" | "office" | "other";

/**
 * Extensions Frappe force-downloads on purpose, and which must therefore never be rendered
 * inline by us either.
 *
 * `send_private_file` sets `Content-Disposition: attachment` for exactly these
 * (response.py, FORCE_DOWNLOAD_EXTENSIONS) because each can carry script: an SVG is a
 * document with <script> in it, not a picture. Previewing one in an <img> is mostly safe,
 * but opening it in a tab on OUR origin runs its script with our session — which is the hole
 * the framework closed. Treating them as "other" keeps download as the only route, so this
 * file cannot re-open it by classifying an .svg as an image.
 */
const NEVER_INLINE = new Set(["svg", "html", "htm", "xml"]);

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"]);
/** Formats a browser can actually play. `.mov` is here because it is usually H.264 in a
 *  QuickTime container, which Safari plays and Chrome often does; when it cannot, the player
 *  fails visibly and Download is still on the menu. `.avi`/`.wmv` are deliberately absent —
 *  no browser plays them, and offering Play would be a lie. */
const VIDEO = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const OFFICE = new Set(["xlsx", "xls", "xlsm", "csv", "docx", "doc", "pptx", "ppt"]);

export function extensionOf(filename: string): string {
  // Split on the LAST dot, and only when it is not the first character: ".gitignore" has no
  // extension, and "report.final.xlsx" is an xlsx.
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function attachmentKind(filename: string): AttachmentKind {
  const ext = extensionOf(filename);
  if (NEVER_INLINE.has(ext)) return "other";
  if (IMAGE.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (VIDEO.has(ext)) return "video";
  if (OFFICE.has(ext)) return "office";
  return "other";
}

/** True when we are willing to render it inside the app. Drives whether a Preview action is
 *  offered at all — never call it for a kind this returns false for. */
export function canPreview(filename: string): boolean {
  const kind = attachmentKind(filename);
  return kind === "image" || kind === "pdf" || kind === "video";
}

/** Which desktop application owns this file, for the "download and open in …" wording.
 *  Naming the actual app beats "your default application", which tells nobody anything. */
export function officeApp(filename: string): "Excel" | "Word" | "PowerPoint" | null {
  const ext = extensionOf(filename);
  if (["xlsx", "xls", "xlsm", "csv"].includes(ext)) return "Excel";
  if (["docx", "doc"].includes(ext)) return "Word";
  if (["pptx", "ppt"].includes(ext)) return "PowerPoint";
  return null;
}

/** Icon name for a chip, so the type is knowable before the file is opened. */
export function attachmentIcon(filename: string): "image" | "video" | "sheet" | "doc" | "paperclip" {
  switch (attachmentKind(filename)) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "pdf":
      return "doc";
    case "office":
      return officeApp(filename) === "Excel" ? "sheet" : "doc";
    default:
      return "paperclip";
  }
}

/** Human file size. Used in the upload warning, where "11.4 MB" is the whole point and
 *  "11962934 bytes" is not. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  // One decimal below 100 MB: the difference between 10.2 and 10.9 matters against a 10 MB
  // cap, and above that nobody is reading the decimal.
  return mb < 100 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

export interface StagedFileIssue {
  file: File;
  /** `too-large` cannot be uploaded at all; `heavy-video` is allowed but worth warning about
   *  before someone waits on it. */
  reason: "too-large" | "heavy-video";
  message: string;
}

/**
 * Problems worth telling someone about BEFORE they hit send.
 *
 * The server enforces the cap regardless; this exists so the answer arrives before the
 * upload rather than after it. Video is called out specially because it is the only type
 * that routinely exceeds 10 MB — roughly half a minute of phone footage — and the person
 * attaching it has no reason to expect a limit until they hit one.
 */
export function stagedFileIssues(files: File[]): StagedFileIssue[] {
  const issues: StagedFileIssue[] = [];
  for (const file of files) {
    const isVideo = attachmentKind(file.name) === "video";
    if (file.size > MAX_ATTACHMENT_BYTES) {
      issues.push({
        file,
        reason: "too-large",
        message: isVideo
          ? `${file.name} is ${formatBytes(file.size)}. Attachments are capped at ${formatBytes(
              MAX_ATTACHMENT_BYTES,
            )} — trim the clip, or share it from a drive link instead.`
          : `${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`,
      });
    } else if (isVideo && file.size > MAX_ATTACHMENT_BYTES / 2) {
      issues.push({
        file,
        reason: "heavy-video",
        message: `${file.name} is ${formatBytes(file.size)} and may take a while to upload.`,
      });
    }
  }
  return issues;
}

/** Is anything staged that the server will certainly refuse? Callers disable their submit on
 *  this, so nobody writes a long reply and then loses the send to a file they were told about
 *  the moment they picked it. `heavy-video` is deliberately NOT blocking: it is allowed, just
 *  slow, and refusing it would invent a limit the backend does not have. */
export function hasBlockingIssue(files: File[]): boolean {
  return stagedFileIssues(files).some((i) => i.reason === "too-large");
}
