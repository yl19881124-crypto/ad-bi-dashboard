export type FieldTag = 'T0' | 'T1';

export interface DimensionField {
  key: string;
  name: string;
  isDate?: boolean;
}

export interface MetricField {
  key: string;
  name: string;
  tag: FieldTag;
}

export interface AdDataRow {
  日期: string;
  版位: string;
  当日付费人数: number;
  展示量: number;
  点击量: number;
}

export type DataRow = Record<string, string | number | null>;
