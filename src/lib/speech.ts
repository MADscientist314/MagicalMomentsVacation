// Talking instead of typing, via the browser's built-in speech recognition
// (Safari and Chrome on a Mac). Where it isn't available, the mic button hides.

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(win: object): SpeechRecognitionCtor | null {
  const w = win as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Adds what was said after what's already in the box. */
export function joinTranscript(base: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return base;
  const before = base.trimEnd();
  return before ? `${before} ${words}` : words;
}
