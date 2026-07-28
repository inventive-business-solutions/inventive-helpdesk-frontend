/**
 * Attachment policy — what we will render, and what we must refuse to.
 *
 * The refusals are the important half. Frappe force-downloads .svg/.html/.htm/.xml because
 * each is a document that can carry script, not inert content (response.py,
 * FORCE_DOWNLOAD_EXTENSIONS). If this module ever classified an .svg as an image, we would
 * offer "Open in new tab" for it — running its script on OUR origin, with the signed-in
 * user's session. That is precisely the hole the framework closed, re-opened from the
 * client side, and nothing else in the app would notice.
 */
import { describe, it, expect } from "vitest";
import {
  attachmentKind,
  canPreview,
  officeApp,
  extensionOf,
  formatBytes,
  stagedFileIssues,
  MAX_ATTACHMENT_BYTES,
} from "../lib/attachments";

/** File is a DOM type but exists in Node ≥20, and only `name`/`size` are read here. */
const file = (name: string, size = 1024) => ({ name, size }) as unknown as File;

describe("extensionOf", () => {
  it("takes the last extension, not the first", () => {
    expect(extensionOf("report.final.xlsx")).toBe("xlsx");
  });
  it("lowercases, so SCREENSHOT.PNG is an image", () => {
    expect(extensionOf("SCREENSHOT.PNG")).toBe("png");
  });
  it("treats a leading dot as part of the name, not an extension", () => {
    // ".gitignore" is a file called .gitignore, not a "gitignore" file.
    expect(extensionOf(".gitignore")).toBe("");
  });
  it("returns empty for a file with no extension at all", () => {
    expect(extensionOf("Makefile")).toBe("");
  });
  it("ignores directories in a path", () => {
    expect(extensionOf("/private/files/a.b/photo.jpg")).toBe("jpg");
  });
});

describe("attachmentKind", () => {
  it("classifies the previewable types", () => {
    expect(attachmentKind("shot.png")).toBe("image");
    expect(attachmentKind("scan.PDF")).toBe("pdf");
    expect(attachmentKind("repro.mp4")).toBe("video");
  });

  it("classifies Office types", () => {
    expect(attachmentKind("costing.xlsx")).toBe("office");
    expect(attachmentKind("spec.docx")).toBe("office");
    expect(attachmentKind("deck.pptx")).toBe("office");
  });

  it("REFUSES to treat script-carrying formats as previewable", () => {
    // Each of these is in Frappe's FORCE_DOWNLOAD_EXTENSIONS for the same reason.
    for (const name of ["logo.svg", "page.html", "page.htm", "data.xml", "LOGO.SVG"]) {
      expect(attachmentKind(name)).toBe("other");
      expect(canPreview(name)).toBe(false);
    }
  });

  it("does not claim to play formats no browser plays", () => {
    // Offering "Play" for an .avi would fail in the player with nothing explaining why.
    expect(attachmentKind("clip.avi")).toBe("other");
    expect(attachmentKind("clip.wmv")).toBe("other");
  });

  it("falls back to other for anything unrecognised", () => {
    expect(attachmentKind("dump.log")).toBe("other");
    expect(attachmentKind("archive.zip")).toBe("other");
    expect(attachmentKind("Makefile")).toBe("other");
  });
});

describe("officeApp", () => {
  it("names the application that owns the file", () => {
    expect(officeApp("costing.xlsx")).toBe("Excel");
    expect(officeApp("rows.csv")).toBe("Excel");
    expect(officeApp("spec.doc")).toBe("Word");
    expect(officeApp("deck.pptx")).toBe("PowerPoint");
  });
  it("is null for everything else, so no Office wording is offered", () => {
    expect(officeApp("shot.png")).toBeNull();
    expect(officeApp("notes.txt")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("keeps one decimal near the cap, where it decides the outcome", () => {
    // 10.4 vs 10 MB is the difference between refused and accepted; rounding hides that.
    expect(formatBytes(10.4 * 1024 * 1024)).toBe("10.4 MB");
  });
  it("drops the decimal once it stops meaning anything", () => {
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });
  it("scales down to KB and bytes", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(512)).toBe("512 B");
  });
});

describe("stagedFileIssues", () => {
  it("says nothing about ordinary files", () => {
    expect(stagedFileIssues([file("shot.png"), file("spec.docx")])).toEqual([]);
  });

  it("refuses anything over the cap, naming the actual size", () => {
    const [issue] = stagedFileIssues([file("demo.mp4", MAX_ATTACHMENT_BYTES + 1)]);
    expect(issue.reason).toBe("too-large");
    expect(issue.message).toContain("10.0 MB");
    // A video gets told what to do about it; a limit with no way forward is just a wall.
    expect(issue.message).toMatch(/trim the clip|drive link/);
  });

  it("gives a non-video over the cap the plain message, with no video advice", () => {
    const [issue] = stagedFileIssues([file("dump.zip", MAX_ATTACHMENT_BYTES + 1)]);
    expect(issue.reason).toBe("too-large");
    expect(issue.message).not.toMatch(/trim the clip/);
  });

  it("warns about a large-but-allowed video without blocking it", () => {
    const [issue] = stagedFileIssues([file("repro.mp4", MAX_ATTACHMENT_BYTES * 0.75)]);
    expect(issue.reason).toBe("heavy-video");
    expect(issue.message).toContain("may take a while");
  });

  it("does not warn about a large NON-video under the cap", () => {
    // Only video routinely surprises people with its size; warning on every 6 MB PDF would
    // train the warning to be ignored.
    expect(stagedFileIssues([file("scan.pdf", MAX_ATTACHMENT_BYTES * 0.75)])).toEqual([]);
  });

  it("reports every offending file, not just the first", () => {
    const issues = stagedFileIssues([
      file("ok.png", 1000),
      file("big.mp4", MAX_ATTACHMENT_BYTES + 1),
      file("heavy.webm", MAX_ATTACHMENT_BYTES * 0.6),
    ]);
    expect(issues.map((i) => i.reason)).toEqual(["too-large", "heavy-video"]);
  });

  it("treats exactly the cap as allowed, not over", () => {
    // The backend refuses `> _MAX_ATTACHMENT_BYTES`, so the boundary must agree or we would
    // reject a file the server would have taken.
    expect(stagedFileIssues([file("edge.zip", MAX_ATTACHMENT_BYTES)])).toEqual([]);
  });
});
