export function greeting(d: Date): "Good morning" | "Good afternoon" | "Good evening" {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
