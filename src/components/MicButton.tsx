import { useEffect, useRef, useState } from "react";
import { IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";
import { getSpeechRecognition, type SpeechRecognitionLike } from "../lib/speech";

const SpeechRecognition = typeof window === "undefined" ? null : getSpeechRecognition(window);

/** Tap to talk, tap again (or pause) to stop; what she says is handed to onSpeech. */
export function MicButton({ onSpeech, disabled }: { onSpeech(text: string): void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recognition.current?.abort(), []);

  if (!SpeechRecognition) return null;

  const start = () => {
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard.trim()) onSpeech(heard);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setProblem("Allow the microphone for this site to talk to me.");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setProblem("I couldn't hear that — try again.");
      }
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    setProblem(null);
    setListening(true);
    r.start();
  };

  return (
    <span className="mic">
      <button
        type="button"
        className={`btn-mic${listening ? " listening" : ""}`}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Talk instead of typing"}
        title={listening ? "Stop listening" : "Talk instead of typing"}
        disabled={disabled}
        onClick={() => (listening ? recognition.current?.stop() : start())}
      >
        {listening ? <IconPlayerStopFilled size={18} aria-hidden /> : <IconMicrophone size={20} aria-hidden />}
      </button>
      {listening && <span className="mic-status">Listening…</span>}
      {problem && (
        <span className="mic-status mic-problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}
