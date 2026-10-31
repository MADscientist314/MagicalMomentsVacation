import { IconArrowLeft } from "@tabler/icons-react";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { ImageStudio } from "../components/ImageStudio";

/** Picture Perfect: any image for her business, without writing a post first. */
export function ImagesPage() {
  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/">
            <IconArrowLeft size={16} aria-hidden />
            All tools
          </a>
          <h1>Picture Perfect</h1>
        </div>
      </header>
      <main className="page images-page">
        <ImageStudio owner={{ type: "library" }} purpose="free" defaultShape="portrait" fileStem="Magical-Moments" />
      </main>
    </>
  );
}
