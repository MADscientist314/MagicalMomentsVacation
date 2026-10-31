import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type { SavedDraftMeta } from "../../shared/drafts";
import type { ToolDef } from "../../shared/tools";
import { ago } from "../lib/ago";
import { deleteDraft, updateDraft } from "../lib/api";

interface Props {
  tool: ToolDef;
  drafts: SavedDraftMeta[];
  currentId: string | null;
  onOpen(id: string): void;
  onChanged(): void;
  onDeleted(id: string): void;
  onError(message: string): void;
}

function SavedItem({ draft, tool, currentId, onOpen, onChanged, onDeleted, onError }: Omit<Props, "drafts"> & { draft: SavedDraftMeta }) {
  const [confirming, setConfirming] = useState(false);
  const fail = (e: Error) => onError(e.message);
  return (
    <li className={draft.id === currentId ? "current" : ""}>
      {tool.id === "inbox-helper" && (
        <input
          type="checkbox"
          aria-label={`Handled: ${draft.title}`}
          title="Handled"
          checked={draft.handled}
          onChange={(e) => void updateDraft(draft.id, { handled: e.target.checked }).then(onChanged).catch(fail)}
        />
      )}
      <button type="button" className="saved-open" onClick={() => onOpen(draft.id)}>
        <span className={draft.handled ? "saved-title done" : "saved-title"}>{draft.title}</span>
        <span className="muted-note">{ago(draft.updated_at)}</span>
      </button>
      {confirming ? (
        <span className="confirm">
          Delete?
          <button
            type="button"
            className="btn-quiet danger"
            onClick={() => void deleteDraft(draft.id).then(() => onDeleted(draft.id)).catch(fail)}
          >
            Delete
          </button>
          <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" className="btn-icon" aria-label={`Delete ${draft.title}`} onClick={() => setConfirming(true)}>
          <IconTrash size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Every finished draft is saved by name, so Jillian can come back to it. Inbox Helper doubles as a to-do list. */
export function SavedDrafts({ drafts, ...rest }: Props) {
  if (!drafts.length) return null;
  const inbox = rest.tool.id === "inbox-helper";
  const groups = inbox
    ? [
        { heading: "To do", items: drafts.filter((d) => !d.handled) },
        { heading: "Handled", items: drafts.filter((d) => d.handled) },
      ]
    : [{ heading: "Saved", items: drafts }];
  return (
    <section className="card saved-drafts" aria-label="Saved drafts">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.heading}>
            <h2>{g.heading}</h2>
            <ul>
              {g.items.map((d) => (
                <SavedItem key={d.id} draft={d} {...rest} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
