export type FieldTag = 'T0' | 'T1';
export type CellValue = string | number | null;
export type DataRow = Record<string, CellValue>;

export interface DimensionField {
  key: string;
  name: string;
}

export interface MetricField {
  key: string;
  name: string;
  tag: FieldTag;
}

export interface ParseSummary {
  totalRows: number;
  totalFields: number;
  sheetName: string;
  fallbackToFirstSheet: boolean;
}
