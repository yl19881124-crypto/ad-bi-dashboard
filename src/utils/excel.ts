import * as XLSX from 'xlsx';
import type { DataRow, DimensionField, MetricField, ParseSummary } from '../types';

const DATE_NAME_PATTERN = /日期|时间|date|day/i;

const toDateString = (value: number | string): string => {
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return value;
  }

  const dateObj = XLSX.SSF.parse_date_code(value);
  if (!dateObj) {
    return String(value);
  }

  const yyyy = String(dateObj.y).padStart(4, '0');
  const mm = String(dateObj.m).padStart(2, '0');
  const dd = String(dateObj.d).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isLikelyNumber = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return false;
  return /^-?\d+(\.\d+)?$/.test(normalized);
};

const normalizeCell = (value: unknown): string | number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim();
  return String(value);
};

const detectDateField = (fieldName: string): boolean => DATE_NAME_PATTERN.test(fieldName);

export const parseWorkbookFile = async (
  file: File,
): Promise<{
  rows: DataRow[];
  dimensions: DimensionField[];
  metrics: MetricField[];
  dateFields: string[];
  summary: ParseSummary;
}> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: false });

  const preferredSheet = '分账户底表';
  const fallbackToFirstSheet = !workbook.SheetNames.includes(preferredSheet);
  const sheetName = fallbackToFirstSheet ? workbook.SheetNames[0] : preferredSheet;
  const worksheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  if (matrix.length === 0) {
    return {
      rows: [],
      dimensions: [],
      metrics: [],
      dateFields: [],
      summary: { totalRows: 0, totalFields: 0, sheetName, fallbackToFirstSheet },
    };
  }

  const headers = (matrix[0] || []).map((h: unknown, index: number) => {
    const text = String(h ?? '').trim();
    return text || `未命名字段_${index + 1}`;
  });

  const rawRows = matrix.slice(1);

  const dateFields = headers.filter((header: string) => detectDateField(header));

  const rows: DataRow[] = rawRows.map((line: unknown[]) => {
    const row: DataRow = {};
    headers.forEach((header: string, idx: number) => {
      const sourceVal = line[idx];
      const normalized = normalizeCell(sourceVal);

      if (normalized === null) {
        row[header] = null;
        return;
      }

      if (dateFields.includes(header)) {
        if (typeof normalized === 'number') {
          row[header] = toDateString(normalized);
          return;
        }

        if (typeof normalized === 'string') {
          row[header] = toDateString(normalized);
          return;
        }
      }

      row[header] = normalized;
    });
    return row;
  });

  const metrics: MetricField[] = [];
  const dimensions: DimensionField[] = [];

  headers.forEach((header: string) => {
    if (dateFields.includes(header)) {
      dimensions.push({ key: header, name: header });
      return;
    }

    const sampleValues = rows.map((row) => row[header]).filter((v) => v !== null);
    const numericCount = sampleValues.filter((v) => isLikelyNumber(v)).length;
    const numericRatio = sampleValues.length > 0 ? numericCount / sampleValues.length : 0;

    if (numericRatio >= 0.6) {
      metrics.push({ key: header, name: header, tag: 'T0' });
    } else {
      dimensions.push({ key: header, name: header });
    }
  });

  const summary: ParseSummary = {
    totalRows: rows.length,
    totalFields: headers.length,
    sheetName,
    fallbackToFirstSheet,
  };

  return { rows, dimensions, metrics, dateFields, summary };
};
