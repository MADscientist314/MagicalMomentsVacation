import { useState } from "react";
import { IconFileText, IconTrash } from "@tabler/icons-react";
import type { DeliverableMeta } from "../../shared/conversations";
import { DELIVERABLE_KINDS, DELIVERABLE_LABELS, type DeliverableKind } from "../../shared/deliverables";
import { deleteDeliverable } from "../lib/api";
import type { ApiError } from "../lib/api";

const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Each kind's versions, newest first. */
export function groupVersions(deliverables: DeliverableMeta[]): { kind: DeliverableKind; versions: DeliverableMeta[] }[] {
  return DELIVERABLE_KINDS.map((kind) => ({
    kind,
    versions: deliverables.filter((d) => d.kind === kind).sort((a, b) => b.version - a.version),
  })).filter((g) => g.versions.length);
}

interface Props {
  deliverables: DeliverableMeta[];
  onOpen(id: string): void;
  onChanged(): void;
  disabled?: boolean;
}

/**
 * The trip's documents: the newest of each kind up front, older versions folded away, and any of them can
 * be deleted (John and Jillian, Nov 17: old drafts piled up and got confusing).
 */
export function DocList({ deliverables, onOpen, onChanged, disabled }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) await deleteDeliverable(id);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
      setConfirm(null);
      onChanged();
    }
  };

  const row = (d: DeliverableMeta) => (
    <li key={d.id} className="doc-row">
      {confirm === d.id ? (
        <span className="doc-confirm" role="group" aria-label={`Delete ${DELIVERABLE_LABELS[d.kind]} v${d.version}?`}>
          <span>
            Delete {DELIVERABLE_LABELS[d.kind].toLowerCase()} v{d.version}? A link showing it stops working.
          </span>
          <button type="button" className="btn-quiet danger" disabled={busy} onClick={() => void remove([d.id])}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => setConfirm(null)}>
            Keep
          </button>
        </span>
      ) : (
        <>
          <button type="button" className="doc-link" onClick={() => onOpen(d.id)}>
            <IconFileText size={16} aria-hidden />
            <span>
              {DELIVERABLE_LABELS[d.kind]} · v{d.version}
            </span>
            <span className="muted-note">{when(d.created_at)}</span>
          </button>
          <button
            type="button"
            className="btn-icon doc-delete"
            aria-label={`Delete ${DELIVERABLE_LABELS[d.kind]} v${d.version}`}
            title="Delete this version"
            disabled={disabled || busy}
            onClick={() => setConfirm(d.id)}
          >
            <IconTrash size={16} aria-hidden />
          </button>
        </>
      )}
    </li>
  );

  return (
    <div className="doc-groups">
      {groupVersions(deliverables).map(({ kind, versions }) => {
        const [newest, ...older] = versions;
        return (
          <div key={kind} className="doc-group">
            <ul className="doc-list">{row(newest)}</ul>
            {older.length > 0 && (
              <details className="doc-older">
                <summary>
                  Older {DELIVERABLE_LABELS[kind].toLowerCase()} versions ({older.length})
                </summary>
                <ul className="doc-list">{older.map(row)}</ul>
                {confirm === `older-${kind}` ? (
                  <p className="doc-confirm">
                    <span>Delete all {older.length} older versions? The newest stays.</span>
                    <button type="button" className="btn-quiet danger" disabled={busy} onClick={() => void remove(older.map((d) => d.id))}>
                      {busy ? "Deleting…" : "Delete them"}
                    </button>
                    <button type="button" className="btn-quiet" disabled={busy} onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </p>
                ) : (
                  <button type="button" className="btn-quiet small" disabled={disabled || busy} onClick={() => setConfirm(`older-${kind}`)}>
                    <IconTrash size={14} aria-hidden /> Delete older versions
                  </button>
                )}
              </details>
            )}
          </div>
        );
      })}
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
