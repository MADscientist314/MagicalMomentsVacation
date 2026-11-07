import { IconHome } from "@tabler/icons-react";

/** The way back to the home screen, at the top right of every page's banner. */
export function HomeButton() {
  return (
    <a className="home-button" href="#/" title="Back to the home screen">
      <IconHome size={18} aria-hidden />
      Home
    </a>
  );
}
