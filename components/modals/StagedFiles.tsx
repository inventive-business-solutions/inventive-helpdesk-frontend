"use client";
import { useRef } from "react";
import { Icon } from "../ui/Icon";

/** Removable chips of staged (not-yet-uploaded) file names. Shared by the full
 *  StagedFiles control and the ticket-reply composer so the chip UX stays identical. */
export function StagedFileChips({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="staged-attachments">
      {files.map((f, i) => (
        <span className="attach staged" key={`${f.name}-${i}`}>
          <Icon name="paperclip" size={14} />
          {f.name}
          <button
            type="button"
            className="rm-attach"
            title="Remove"
            aria-label={`Remove ${f.name}`}
            onClick={() => onRemove(i)}
          >
            <Icon name="x" size={12} strokeWidth={2.4} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** A reusable file-staging control: a drop-style button + removable chips of file names. */
export function StagedFiles({
  files,
  onChange,
  label = "Attach screenshots, files or logs",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  };
  const remove = (i: number) => onChange(files.filter((_, idx) => idx !== i));

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <button type="button" className="attach-drop" onClick={() => inputRef.current?.click()}>
        <Icon name="paperclip" size={16} />
        {label}
      </button>
      <StagedFileChips files={files} onRemove={remove} />
    </>
  );
}
