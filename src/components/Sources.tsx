/** Web sources behind a reply, folded away so long lists don't crowd the draft. */
export function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  const links = sources.filter((s) => /^https?:\/\//i.test(s.url));
  if (!links.length) return null;
  return (
    <details className="sources-box">
      <summary>Sources ({links.length})</summary>
      <ul className="sources">
        {links.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
