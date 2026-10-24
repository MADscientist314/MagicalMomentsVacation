export function maskedNotice(emails: number, phones: number): string | null {
  const parts = [];
  if (emails) parts.push(`${emails} email${emails > 1 ? "s" : ""}`);
  if (phones) parts.push(`${phones} phone number${phones > 1 ? "s" : ""}`);
  return parts.length ? `Hid ${parts.join(" and ")} — they aren't needed here.` : null;
}
