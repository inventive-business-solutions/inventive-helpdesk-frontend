"use client";
import { TextField, Field } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { CheckList } from "../ui/CheckList";
import type { Client } from "../../types";

/**
 * The parts of an engagement that are not the product itself: its dates and the divisions
 * it covers.
 *
 * Shared because two dialogs now ask for exactly this. `AddClientProductModal` attaches an
 * existing product to a client; `AddProductModal` can create a product and put it into
 * service in the same step. Duplicating the scope rules across both is how they would
 * drift — and the client-wide rule in particular is subtle enough that one copy quietly
 * disagreeing with the other would be a real bug rather than a cosmetic one.
 */
export function EngagementFields({
  client,
  clientName,
  devStart,
  onDevStart,
  completion,
  onCompletion,
  scope,
  onScope,
  divisions,
  onDivisions,
}: {
  /** Resolved client, for its divisions and code. Undefined until one is chosen. */
  client?: Client;
  /** Display name used in the hint copy. */
  clientName: string;
  devStart: string;
  onDevStart: (v: string) => void;
  completion: string;
  onCompletion: (v: string) => void;
  scope: "client" | "divisions";
  onScope: (v: "client" | "divisions") => void;
  /** Division docnames this engagement covers. Empty means client-wide. */
  divisions: string[];
  onDivisions: (v: string[]) => void;
}) {
  const divs = client?.divisions ?? [];
  const hasDivisions = divs.length > 0;
  // A client with no divisions can only be client-wide, whatever the toggle says.
  const clientWide = scope === "client" || !hasDivisions;

  return (
    <>
      <div className="field-2">
        <TextField label="Dev start date" optional type="date" value={devStart} onChange={onDevStart} />
        <TextField
          label="Expected completion"
          optional
          type="date"
          value={completion}
          onChange={onCompletion}
        />
      </div>

      <Field label="Where does it run?" required>
        {() => (
          <>
            {/* Only shown when there is a choice — a client with no divisions can only
                be client-wide, and offering a disabled option is noise. */}
            {hasDivisions && (
              <Segmented
                ariaLabel="Product scope"
                options={[
                  { key: "client", label: "Client-wide" },
                  { key: "divisions", label: "Specific divisions" },
                ]}
                value={clientWide ? "client" : "divisions"}
                onChange={(v) => onScope(v as "client" | "divisions")}
              />
            )}
            <div className="field-hint">
              {clientWide
                ? hasDivisions
                  ? `Applies to all of ${clientName}, including divisions added later.`
                  : `${clientName} has no divisions yet, so this applies to the client as a whole. You can scope it to divisions once they exist.`
                : "Only the divisions ticked below run this product."}
            </div>
          </>
        )}
      </Field>

      {!clientWide && hasDivisions && (
        <CheckList
          label="Divisions running this product"
          labelHead="Division"
          metaHead="Code"
          selected={divisions}
          options={divs.map((d) => ({
            value: d.docname ?? d.name,
            label: d.name,
            hint: `${client?.code}-${d.code}`,
          }))}
          onChange={onDivisions}
        />
      )}
    </>
  );
}
