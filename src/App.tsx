import { useEffect, useState } from "react";
import { isToolId, TOOLS } from "../shared/tools";
import { Home } from "./pages/Home";
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
  const id = useHash().replace(/^#\/?/, "");
  return isToolId(id) ? <ToolPage key={id} tool={TOOLS[id]} /> : <Home />;
}
