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

export async function signOut(): Promise<void> {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
}
