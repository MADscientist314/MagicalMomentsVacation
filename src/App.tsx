import { useEffect, useState } from "react";
import { isToolId, TOOLS } from "../shared/tools";
import { checkSession, signOut } from "./lib/session";
import { ChatPage } from "./pages/ChatPage";
import { Home } from "./pages/Home";
import { LoginPage } from "./pages/LoginPage";
import { ToolPage } from "./pages/ToolPage";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const id = useHash().replace(/^#\/?/, "");

  useEffect(() => {
    void checkSession().then(setSignedIn);
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) return <LoginPage onSignedIn={() => setSignedIn(true)} />;
  if (id === "chat") return <ChatPage />;
  if (isToolId(id)) return <ToolPage key={id} tool={TOOLS[id]} />;
  return (
    <Home
      onSignOut={async () => {
        await signOut();
        setSignedIn(false);
      }}
    />
  );
}
