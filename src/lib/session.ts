const OFFLINE = "Couldn't reach the assistant — check the internet connection.";

export async function checkSession(): Promise<boolean> {
  try {
    return (await fetch("/api/session")).ok;
  } catch {
    return false;
  }
}

/** Returns null when signed in, otherwise a message to show. */
export async function signIn(password: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    return OFFLINE;
  }
  if (res.ok) return null;
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error ?? "Something went wrong — try again.";
}

/** Who the browser saves the magic words under: one shared sign-in for Jillian and John. */
export const SAVED_AS = "Magical Moments";

// Chrome's Credential Management API (not in TypeScript's DOM types, and missing in Safari and Firefox).
type PasswordCredentialCtor = new (init: { id: string; password: string; name?: string }) => Credential;

/**
 * Asks the browser to remember the magic words after a good sign-in. Chrome shows its "Save password?"
 * bubble; other browsers rely on the form's username and password fields instead.
 */
export async function rememberPassword(password: string): Promise<void> {
  const PasswordCredential = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  if (!PasswordCredential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new PasswordCredential({ id: SAVED_AS, password, name: "Magical Moments assistant" }));
  } catch {
    // Declined, or the browser's password manager is off: nothing to do.
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
}
