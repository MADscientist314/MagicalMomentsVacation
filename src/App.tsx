import { useEffect, useState } from "react";
import { TOOLS } from "../shared/tools";
import { parseRoute } from "./lib/route";
import { checkSession, signOut } from "./lib/session";
import { ChatPage } from "./pages/ChatPage";
import { Home } from "./pages/Home";
import { LoginPage } from "./pages/LoginPage";
import { NewTripPage } from "./pages/NewTripPage";
import { ToolPage } from "./pages/ToolPage";
import { TripPage } from "./pages/TripPage";
import { TripsPage } from "./pages/TripsPage";

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
  const route = parseRoute(useHash());

  useEffect(() => {
    void checkSession().then(setSignedIn);
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) return <LoginPage onSignedIn={() => setSignedIn(true)} />;
  switch (route.page) {
    case "trips":
      return <TripsPage />;
    case "new-trip":
      return <NewTripPage />;
    case "trip":
      return <TripPage key={route.id} id={route.id} />;
    case "chat":
      return <ChatPage key={route.id ?? "new"} id={route.id} />;
    case "tool":
      return <ToolPage key={route.tool} tool={TOOLS[route.tool]} />;
    default:
      return (
        <Home
          onSignOut={async () => {
            await signOut();
            setSignedIn(false);
          }}
        />
      );
  }
}
