import { IconDoorEnter, IconMailHeart, IconMap2, IconWand, type Icon } from "@tabler/icons-react";
import { TOOLS } from "../../shared/tools";
import { FireworksNight } from "../art/FireworksNight";
import { greeting } from "../lib/greeting";

const ICONS: Record<string, Icon> = {
  "mail-heart": IconMailHeart,
  "door-enter": IconDoorEnter,
  wand: IconWand,
  "map-2": IconMap2,
};

export function Home({ onSignOut }: { onSignOut(): void }) {
  return (
    <>
      <header className="hero">
        <FireworksNight />
        <div className="hero-text">
          <h1 className="greeting">{greeting(new Date())}, Jillian</h1>
          <p className="hero-sub">What can I help you with today?</p>
        </div>
      </header>
      <main className="page">
        <nav className="tiles" aria-label="Tools">
          {Object.values(TOOLS).map((t) => {
            const ToolIcon = ICONS[t.icon];
            return (
              <a key={t.id} className="tile" href={`#/${t.id}`}>
                <ToolIcon size={26} aria-hidden />
                <span className="tile-name">{t.name}</span>
                {t.subtitle}
              </a>
            );
          })}
        </nav>
        <p className="footnote">
          Everything here is a draft for you to review. Nothing is sent until you send it.{" "}
          <button type="button" className="link-button" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </main>
    </>
  );
}
