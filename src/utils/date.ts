import * as XLSX from 'xlsx';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatYyyyMmDd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() + 1 !== month
    || candidate.getDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function formatFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatYyyyMmDd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatFromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) {
    return null;
  }

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) {
    return null;
  }

  return formatYyyyMmDd(parsed.y, parsed.m, parsed.d);
}

function normalizeDateString(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      const serialResult = formatFromExcelSerial(parsedNumber);
      if (serialResult) {
        return serialResult;
      }
    }
  }

  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+.*)?$/);
  if (ymdMatch) {
    const normalized = formatYyyyMmDd(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
    if (normalized) {
      return normalized;
    }
  }

  const parsedDate = new Date(trimmed);
  return formatFromDate(parsedDate);
}

export function normalizeExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return formatFromDate(value);
  }

  if (typeof value === 'number') {
    return formatFromExcelSerial(value);
  }

  if (typeof value === 'string') {
    return normalizeDateString(value);
  }

  return null;
}
