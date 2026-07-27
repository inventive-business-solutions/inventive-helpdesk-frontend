"use client";
import { Icon } from "./Icon";

/**
 * A section's own search box.
 *
 * Replaces the single global search that used to live in the Topbar. That one only ever
 * searched tickets no matter which page you were on, so on Clients or Products it was
 * either useless or actively misleading — it navigated you away from the list you were
 * looking at. Each list now owns a box that searches that list and nothing else.
 *
 * Controlled, and deliberately not debounced: these lists are already fully in memory, so
 * filtering is a synchronous array pass and a delay would only make typing feel laggy.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Defaults to the placeholder — set it when the placeholder is not a full description. */
  ariaLabel?: string;
}) {
  return (
    <div className="search" role="search">
      <Icon name="search" size={16} />
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange("")}>
          <Icon name="x" size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
