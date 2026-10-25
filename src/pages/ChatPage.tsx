import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconPin, IconPinnedOff, IconPlus, IconTrash } from "@tabler/icons-react";
import type { Conversation } from "../../shared/conversations";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { MagicLamp } from "../art/MagicLamp";
import { Composer } from "../components/Composer";
import { ConversationThread } from "../components/ConversationThread";
import { deleteConversation, getConversation, listConversations, updateConversation } from "../lib/api";
import { initialChatState } from "../lib/chatState";
import { startChat } from "../lib/startChat";
import { loadThread, sendToThread, useThread } from "../lib/threadStore";

const STARTERS = [
  "What's new at Walt Disney World this year?",
  "A family is torn between Disney and Universal for a first trip. What should I ask them?",
  "Give me three Facebook post ideas for this month.",
];

function ChatList({ chats, currentId, onChanged }: { chats: Conversation[]; currentId?: string; onChanged(): void }) {
  return (
    <nav className="card chat-list" aria-label="Your chats">
      <div className="card-head">
        <h2>Your chats</h2>
        <a className="btn-quiet" href="#/chat">
          <IconPlus size={14} aria-hidden /> New
        </a>
      </div>
      {chats.length === 0 && <p className="muted-note">Your past chats will show up here.</p>}
      <ul>
        {chats.map((c) => (
          <li key={c.id} className={c.id === currentId ? "current" : ""}>
            <a href={`#/chat/${c.id}`}>
              {c.pinned && "📌 "}
              {c.title}
            </a>
            <span className="chat-actions">
              <button
                type="button"
                className="btn-icon"
                aria-label={c.pinned ? "Unpin" : "Pin"}
                onClick={() => void updateConversation(c.id, { pinned: !c.pinned }).then(onChanged)}
              >
                {c.pinned ? <IconPinnedOff size={15} aria-hidden /> : <IconPin size={15} aria-hidden />}
              </button>
              <button
                type="button"
                className="btn-icon"
                aria-label="Delete chat"
                onClick={() =>
                  void deleteConversation(c.id).then(() => {
                    if (c.id === currentId) window.location.hash = "#/chat";
                    onChanged();
                  })
                }
              >
                <IconTrash size={15} aria-hidden />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ChatPage({ id }: { id?: string }) {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const thread = useThread(id ?? "new");
  const state = id ? thread : initialChatState;
  const busy = state.phase !== "idle";

  const refreshList = useCallback(() => {
    listConversations("chat")
      .then(setChats)
      .catch(() => {});
  }, []);

  useEffect(refreshList, [refreshList]);

  useEffect(() => {
    if (!id) return;
    getConversation(id)
      .then((c) => loadThread(id, c.messages))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const send = async (text: string): Promise<string | null> => {
    if (id) return sendToThread(id, text, refreshList);
    const started = await startChat(text);
    if ("error" in started) return started.error;
    refreshList();
    window.location.hash = `#/chat/${started.id}`;
    return null;
  };

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/">
            <IconArrowLeft size={16} aria-hidden />
            All tools
          </a>
          <h1 className="genie-title">Make a wish… or ask me anything</h1>
        </div>
      </header>
      <main className="page chat-layout">
        <ChatList chats={chats} currentId={id} onChanged={refreshList} />
        <section className="chat-main">
          <div className="card chat-thread">
            {error && <p className="message message-error">{error}</p>}
            {!id || (state.turns.length === 0 && !busy) ? (
              <div className="chat-empty">
                <MagicLamp size={96} />
                <p>Ask about parks, ships, clients or marketing — type below, or tap the microphone and just talk.</p>
                <div className="starters">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className="btn-quiet" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ConversationThread state={state} mode="chat" />
            )}
          </div>
          <Composer
            busy={busy}
            placeholder="Type or tap the microphone to talk…"
            restore={state.restore}
            error={state.error}
            notice={state.notice}
            onSend={send}
          />
        </section>
      </main>
    </>
  );
}
