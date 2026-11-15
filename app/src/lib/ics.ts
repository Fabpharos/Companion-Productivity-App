// Writes calendar files (.ics) that the iPhone's Calendar can import.
//
// Times are written without a time zone, which calendars read as "this time
// on the clock, wherever you are". That is what an itinerary wants: a 9:00
// stop in Tokyo stays at 9:00 when the phone changes zone on landing.

export interface CalendarEvent {
  uid: string;
  title: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** HH:MM. Without it the event lasts all day. */
  time?: string | null;
  minutes?: number;
  location?: string | null;
  notes?: string | null;
}

const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes must be folded, continuing on the next line after a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date: string) => date.replace(/-/g, "");

function stamp(date: string, time: string, addMinutes = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const at = new Date(y!, m! - 1, d!, h!, min! + addMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}T${pad(at.getHours())}${pad(at.getMinutes())}00`;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(y!, m! - 1, d! + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
}

export function makeCalendar(events: CalendarEvent[], now: number): string {
  const created = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Companion//Companion Productivity App//EN", "CALSCALE:GREGORIAN"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${event.uid}@companion`, `DTSTAMP:${created}`);
    if (event.time) {
      lines.push(`DTSTART:${stamp(event.date, event.time)}`, `DTEND:${stamp(event.date, event.time, event.minutes ?? 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(event.date)}`, `DTEND;VALUE=DATE:${nextDay(event.date)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location?.trim()) lines.push(`LOCATION:${escapeText(event.location.trim())}`);
    if (event.notes?.trim()) lines.push(`DESCRIPTION:${escapeText(event.notes.trim())}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
