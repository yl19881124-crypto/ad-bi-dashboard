import * as XLSX from 'xlsx';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidYyyyMmDd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (year < 1000 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

function formatYyyyMmDd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function parseExcelSerial(serial: number): string {
  if (!Number.isFinite(serial)) {
    return '';
  }

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !isValidYyyyMmDd(parsed.y, parsed.m, parsed.d)) {
    return '';
  }

  return formatYyyyMmDd(parsed.y, parsed.m, parsed.d);
}

function parseDateObject(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();

  if (!isValidYyyyMmDd(year, month, day)) {
    return '';
  }

  return formatYyyyMmDd(year, month, day);
}

function parseDateString(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseExcelSerial(Number(trimmed));
  }

  const datePattern = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:\s*日)?(?:\s+.*)?$/;
  const match = trimmed.match(datePattern);
  if (!match) {
    return '';
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidYyyyMmDd(year, month, day)) {
    return '';
  }

  return formatYyyyMmDd(year, month, day);
}

export function normalizeExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    return parseExcelSerial(value);
  }

  if (value instanceof Date) {
    return parseDateObject(value);
  }

  if (typeof value === 'string') {
    return parseDateString(value);
  }

  return '';
}
