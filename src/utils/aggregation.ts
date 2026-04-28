import type { MetricConfig } from '../config/metricConfig';
import { getMetricType, metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import { normalizeExcelDate } from './date';

export interface AggregatedRow {
  日期: string;
  拆分维度: string;
  指标值: number | null;
  当日付费人数: number | null;
  当日付费成本: number | null;
  当日付费ROI: number | null;
  '3日付费率': number | null;
}

export type FilterSelections = Record<string, string[]>;

interface AggregationOptions {
  rows: DataRow[];
  splitDimension: string;
  metricKey: string;
  dateRange?: [string, string] | null;
  filters?: FilterSelections;
  maxSeries?: number;
}

interface GroupState {
  date: string;
  splitValue: string;
  sums: Record<string, number>;
  days: Set<string>;
}

const UNKNOWN_SPLIT_VALUE = '未知';
const OTHER_SPLIT_VALUE = '其他';

function buildGroupKey(date: string, splitValue: string): string {
  return JSON.stringify([date, splitValue]);
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeDate(dateValue: unknown): string {
  const normalized = normalizeExcelDate(dateValue);
  if (normalized) return normalized;
  if (typeof dateValue === 'string') return dateValue.trim() || '-';
  return '-';
}

function inDateRange(date: string, dateRange?: [string, string] | null): boolean {
  if (!dateRange) return true;
  const [start, end] = dateRange;
  if (!date || date === '-') return false;
  return date >= start && date <= end;
}

function resolveMetricValue(metricKey: string, sums: Record<string, number>, dayCount: number): number | null {
  const config: MetricConfig | undefined = metricConfigMap.get(metricKey);
  if (!config) {
    const fallback = sums[metricKey] ?? 0;
    return Number.isFinite(fallback) ? fallback : null;
  }
  if (config.mode === 'source') return sums[config.sourceField] ?? 0;
  if (config.mode === 'daily_average_source') {
    if (!Number.isFinite(dayCount) || dayCount <= 0) return null;
    return (sums[config.sourceField] ?? 0) / dayCount;
  }

  const numerator = sums[config.numerator] ?? 0;
  const denominator = sums[config.denominator] ?? 0;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function collectNumericSums(row: DataRow, sums: Record<string, number>) {
  Object.entries(row).forEach(([field, value]) => {
    if (field === '日期') return;
    sums[field] = (sums[field] ?? 0) + toNumber(value);
  });
}

function mergeGroupState(target: GroupState, source: GroupState) {
  Object.entries(source.sums).forEach(([field, value]) => {
    target.sums[field] = (target.sums[field] ?? 0) + value;
  });
  source.days.forEach((day) => target.days.add(day));
}

function doesRowMatchFilters(row: DataRow, filters: FilterSelections): boolean {
  return Object.entries(filters).every(([field, values]) => {
    if (!values.length) return true;
    const raw = row[field];
    const normalized = raw === null || raw === undefined ? '' : String(raw).trim();
    return values.includes(normalized);
  });
}

export function filterRows(rows: DataRow[], filters: FilterSelections): DataRow[] {
  if (!Object.values(filters).some((list) => list.length > 0)) return rows;
  return rows.filter((row) => doesRowMatchFilters(row, filters));
}

export function getFilterOptions(rows: DataRow[], fields: string[]): Record<string, string[]> {
  const options: Record<string, string[]> = {};
  fields.forEach((field) => {
    const values = Array.from(
      new Set(
        rows
          .map((row) => row[field])
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
          .map((value) => String(value).trim()),
      ),
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

    if (values.length > 0) options[field] = values;
  });
  return options;
}

function buildMetricSums(rows: DataRow[], dateRange?: [string, string] | null): Record<string, number> {
  const sums: Record<string, number> = {};
  const days = new Set<string>();
  rows.forEach((row) => {
    const date = normalizeDate(row.日期);
    if (!inDateRange(date, dateRange)) return;
    days.add(date);
    collectNumericSums(row, sums);
  });
  sums.__dayCount__ = days.size;
  return sums;
}

export function calculateMetricByRange(rows: DataRow[], metricKey: string, dateRange?: [string, string] | null): number | null {
  const sums = buildMetricSums(rows, dateRange);
  return resolveMetricValue(metricKey, sums, sums.__dayCount__ ?? 0);
}

export function aggregateRowsByDateAndDimension({ rows, splitDimension, metricKey, dateRange, filters = {}, maxSeries = 10 }: AggregationOptions) {
  const filteredRows = filterRows(rows, filters);
  const baseGroups = new Map<string, GroupState>();

  filteredRows.forEach((row) => {
    const date = normalizeDate(row.日期);
    if (!inDateRange(date, dateRange)) return;

    const splitRawValue = row[splitDimension];
    const normalizedValue = splitRawValue === null || splitRawValue === undefined ? '' : String(splitRawValue).trim();
    const splitValue = normalizedValue === '' ? UNKNOWN_SPLIT_VALUE : normalizedValue;
    const key = buildGroupKey(date, splitValue);

    if (!baseGroups.has(key)) {
      baseGroups.set(key, { date, splitValue, sums: {}, days: new Set<string>() });
    }

    const group = baseGroups.get(key)!;
    group.days.add(date);
    collectNumericSums(row, group.sums);
  });

  const totalsBySplit = new Map<string, GroupState>();
  baseGroups.forEach((group) => {
    if (!totalsBySplit.has(group.splitValue)) totalsBySplit.set(group.splitValue, { date: 'TOTAL', splitValue: group.splitValue, sums: {}, days: new Set<string>() });
    mergeGroupState(totalsBySplit.get(group.splitValue)!, group);
  });

  const rankedSplitValues = Array.from(totalsBySplit.values())
    .map((group) => ({ splitValue: group.splitValue, value: resolveMetricValue(metricKey, group.sums, group.days.size) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .map((item) => item.splitValue);

  const topSplitValues = new Set(rankedSplitValues.slice(0, maxSeries));
  const needOthers = rankedSplitValues.length > maxSeries;

  const mergedGroups = new Map<string, GroupState>();
  baseGroups.forEach((group) => {
    const normalizedSplit = topSplitValues.has(group.splitValue) ? group.splitValue : OTHER_SPLIT_VALUE;
    if (normalizedSplit === OTHER_SPLIT_VALUE && !needOthers) return;

    const key = buildGroupKey(group.date, normalizedSplit);
    if (!mergedGroups.has(key)) mergedGroups.set(key, { date: group.date, splitValue: normalizedSplit, sums: {}, days: new Set<string>() });
    mergeGroupState(mergedGroups.get(key)!, group);
  });

  const aggregatedRows = Array.from(mergedGroups.values())
    .map((group) => ({
      日期: group.date,
      拆分维度: group.splitValue,
      指标值: resolveMetricValue(metricKey, group.sums, group.days.size),
      当日付费人数: resolveMetricValue('当日付费人数', group.sums, group.days.size),
      当日付费成本: resolveMetricValue('当日付费成本', group.sums, group.days.size),
      当日付费ROI: resolveMetricValue('当日付费ROI', group.sums, group.days.size),
      '3日付费率': resolveMetricValue('3日付费率', group.sums, group.days.size),
    }))
    .sort((a, b) => {
      if (a.日期 === b.日期) return a.拆分维度.localeCompare(b.拆分维度, 'zh-CN');
      return a.日期.localeCompare(b.日期, 'zh-CN');
    });

  return {
    metricType: getMetricType(metricKey),
    rows: aggregatedRows,
    dates: Array.from(new Set(aggregatedRows.map((row) => row.日期))),
    series: Array.from(new Set(aggregatedRows.map((row) => row.拆分维度))),
    filteredRows,
  };
}

export function formatMetricValue(value: number | null, metricType: ReturnType<typeof getMetricType>) {
  if (value === null || !Number.isFinite(value)) return '-';
  if (metricType === 'percent' || metricType === 'roi') return `${(value * 100).toFixed(2)}%`;
  if (metricType === 'currency') return value.toFixed(2);
  return `${Math.round(value)}`;
}
