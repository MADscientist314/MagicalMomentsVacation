import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";

/** A trash button that asks "Delete?" in place before it does anything. */
export function ConfirmDelete({ label, onDelete }: { label: string; onDelete(): void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="confirm">
      Delete?
      <button type="button" className="btn-quiet danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" className="btn-icon" aria-label={label} onClick={() => setConfirming(true)}>
      <IconTrash size={15} aria-hidden />
    </button>
  );
}
