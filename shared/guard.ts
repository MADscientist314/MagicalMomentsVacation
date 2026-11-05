// Detects details that must never be sent to the assistant (card numbers, SSNs,
// passport numbers) and masks contact details no draft needs. Runs in both the
// browser (before sending) and the Worker (before calling Claude).

export type SensitiveKind = "card" | "ssn" | "passport";

export const SENSITIVE_MESSAGES: Record<SensitiveKind, string> = {
  card: "That looks like a card number — please remove it. Card details never go into the assistant.",
  ssn: "That looks like a Social Security number — please remove it. It never goes into the assistant.",
  passport: "That looks like a passport number — please remove it. It never goes into the assistant.",
};

// 13–19 digits, optionally separated by single spaces or dashes.
const CARD_RUN = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const SSN_FORMATTED = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
const SSN_KEYWORD = /(?:ssn|social security)\D{0,20}\d{3}[- ]?\d{2}[- ]?\d{4}(?!\d)/i;
// "passport", an optional "number/no./#/:", then the number itself. "Bring your passports;
// booking 1234567" must not match, so the number has to follow the word directly.
const PASSPORT_NUMBER = /passport\s*(?:number|num|no\.?)?\s*[#:]?\s*([A-Za-z0-9]{6,9})\b/gi;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Only formatted phone numbers: a bare 10-digit run could be a confirmation number.
const PHONE =
  /(?:\+1[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}|\(\d{3}\)[ .-]?\d{3}[ .-]?\d{4}|(?<![\d+])\d{3}[ .-]\d{3}[ .-]\d{4})(?!\d)/g;

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

function hasCard(text: string): boolean {
  for (const match of text.matchAll(CARD_RUN)) {
    if (luhnValid(match[0].replace(/[ -]/g, ""))) return true;
  }
  return false;
}

function hasPassport(text: string): boolean {
  for (const match of text.matchAll(PASSPORT_NUMBER)) {
    if ((match[1].match(/\d/g)?.length ?? 0) >= 6) return true;
  }
  return false;
}

export function findSensitive(text: string): SensitiveKind[] {
  const kinds: SensitiveKind[] = [];
  if (hasCard(text)) kinds.push("card");
  if (SSN_FORMATTED.test(text) || SSN_KEYWORD.test(text)) kinds.push("ssn");
  if (hasPassport(text)) kinds.push("passport");
  return kinds;
}

const SSN_FORMATTED_ALL = new RegExp(SSN_FORMATTED.source, "g");
const SSN_KEYWORD_ALL = /((?:ssn|social security)\D{0,20})(\d{3}[- ]?\d{2}[- ]?\d{4})(?!\d)/gi;

export const REDACTED: Record<SensitiveKind, string> = {
  card: "[card number removed]",
  ssn: "[SSN removed]",
  passport: "[passport number removed]",
};

/**
 * Replaces card, SSN and passport numbers instead of refusing the whole text. Used for files she
 * attaches (a cruise document can carry passport numbers), which she can't edit the way she can
 * edit what she types. The result passes findSensitive.
 */
export function redactSensitive(text: string): { text: string; removed: Record<SensitiveKind, number> } {
  const removed: Record<SensitiveKind, number> = { card: 0, ssn: 0, passport: 0 };
  let out = text.replace(CARD_RUN, (run) => {
    if (!luhnValid(run.replace(/[ -]/g, ""))) return run;
    removed.card++;
    return REDACTED.card;
  });
  out = out
    .replace(SSN_KEYWORD_ALL, (_m, label: string) => {
      removed.ssn++;
      return `${label}${REDACTED.ssn}`;
    })
    .replace(SSN_FORMATTED_ALL, () => {
      removed.ssn++;
      return REDACTED.ssn;
    })
    .replace(PASSPORT_NUMBER, (match, number: string) => {
      if ((number.match(/\d/g)?.length ?? 0) < 6) return match;
      removed.passport++;
      return match.slice(0, match.length - number.length) + REDACTED.passport;
    });
  return { text: out, removed };
}

export function maskContacts(text: string): { text: string; emails: number; phones: number } {
  let emails = 0;
  let phones = 0;
  const masked = text
    .replace(EMAIL, () => {
      emails++;
      return "[email]";
    })
    .replace(PHONE, () => {
      phones++;
      return "[phone]";
    });
  return { text: masked, emails, phones };
}
