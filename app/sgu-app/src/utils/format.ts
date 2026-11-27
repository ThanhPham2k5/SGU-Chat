export function parseInstant(iso: string): Date {
  // Hermes không đọc được phần thập phân quá 3 chữ số, nên cắt bớt.
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1"));
}

export function timeValue(iso: string): number {
  return parseInstant(iso).getTime() || 0;
}

export function formatTime(iso: string): string {
  const d = parseInstant(iso);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === new Date().toDateString()) {
    return `${hh}:${mm}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${MM}`;
}