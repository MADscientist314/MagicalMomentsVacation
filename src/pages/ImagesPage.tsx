import { CastleAtDusk } from "../art/CastleAtDusk";
import { HomeButton } from "../components/HomeButton";
import { ImageStudio } from "../components/ImageStudio";

/** Picture Perfect: any image for her business, without writing a post first. */
export function ImagesPage() {
  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <HomeButton />
        <div className="banner-text">
          <h1>Picture Perfect</h1>
        </div>
      </header>
      <main className="page images-page">
        <ImageStudio owner={{ type: "library" }} purpose="free" defaultShape="portrait" fileStem="Magical-Moments" />
      </main>
    </>
  );
}
