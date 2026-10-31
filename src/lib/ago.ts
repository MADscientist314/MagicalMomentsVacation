/** "today", "yesterday", "3 days ago", or the date for anything older than a week. */
export const ago = (ms: number) => {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(ms).toLocaleDateString();
};
