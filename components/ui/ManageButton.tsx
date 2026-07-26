"use client";
import { Icon } from "./Icon";

/**
 * The single row action, replacing a pencil + ✕ pair.
 *
 * Two icon buttons cost two columns whose widths depend on their icons, which is what made
 * the trailing controls sit at different x down a list. One fixed-width control is one
 * column, so alignment holds by construction rather than by matching icon widths.
 *
 * It opens the thing's edit view, where Save, Delete and Close live together. That is the
 * point: a bare ✕ in a row deletes on one click, next to a pencil it is a mis-click away,
 * and neither says what it will remove. Behind Manage, deleting is a deliberate act taken
 * while looking at the record.
 */
export function ManageButton({ subject, onClick }: { subject: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="row-manage"
      title={`Manage ${subject}`}
      aria-label={`Manage ${subject}`}
      // Rows are clickable (a product row opens its tickets); managing must not also
      // navigate away from the row you meant to manage.
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name="pencil" size={13} />
      Manage
    </button>
  );
}
