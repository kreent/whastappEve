// Minimal RFC4180-ish CSV parser. Handles quoted fields with commas,
// double-quote escaping, and \r\n / \n line endings.

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  // last cell
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function normalizePhone(raw: string): string | null {
  // Keep digits only. Strip leading "+", spaces, parentheses, dashes.
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 18) return null;
  return digits;
}
