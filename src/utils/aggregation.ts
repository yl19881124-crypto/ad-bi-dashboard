import dayjs, { Dayjs } from 'dayjs';
import type { MetricConfig } from '../config/metricConfig';
import { getMetricType, metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import { normalizeExcelDate } from './date';

export interface AggregatedRow {
  日期: string;
  拆分维度: string;
  指标值: number | null;
}

interface AggregationOptions {
  rows: DataRow[];
  splitDimension: string;
  metricKey: string;
  dateRange?: [Dayjs, Dayjs] | null;
  maxSeries?: number;
}

interface GroupState {
  date: string;
  splitValue: string;
  sums: Record<string, number>;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeDate(dateValue: unknown): string {
  const normalized = normalizeExcelDate(dateValue);
  if (normalized) {
    return normalized;
  }

  if (typeof dateValue === 'string') {
    return dateValue.trim() || '-';
  }

  return '-';
}

function inDateRange(date: string, dateRange?: [Dayjs, Dayjs] | null): boolean {
  if (!dateRange) {
    return true;
  }

  const [start, end] = dateRange;
  const current = dayjs(date);
  if (!current.isValid()) {
    return false;
  }

  return (current.isAfter(start, 'day') || current.isSame(start, 'day')) && (current.isBefore(end, 'day') || current.isSame(end, 'day'));
}

function resolveMetricValue(metricKey: string, sums: Record<string, number>): number | null {
  const config: MetricConfig | undefined = metricConfigMap.get(metricKey);

  if (!config) {
    const fallback = sums[metricKey] ?? 0;
    return Number.isFinite(fallback) ? fallback : null;
  }

  if (config.mode === 'source') {
    return sums[config.sourceField] ?? 0;
  }

  const numerator = sums[config.numerator] ?? 0;
  const denominator = sums[config.denominator] ?? 0;

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function collectNumericSums(row: DataRow, sums: Record<string, number>) {
  Object.entries(row).forEach(([field, value]) => {
    if (field === '日期') {
      return;
    }
    sums[field] = (sums[field] ?? 0) + toNumber(value);
  });
}

function mergeGroupState(target: GroupState, source: GroupState) {
  Object.entries(source.sums).forEach(([field, value]) => {
    target.sums[field] = (target.sums[field] ?? 0) + value;
  });
}

export function aggregateRowsByDateAndDimension({ rows, splitDimension, metricKey, dateRange, maxSeries = 10 }: AggregationOptions) {
  const baseGroups = new Map<string, GroupState>();

  rows.forEach((row) => {
    const date = normalizeDate(row.日期);
    if (!inDateRange(date, dateRange)) {
      return;
    }

    const splitRawValue = row[splitDimension];
    const splitValue = splitRawValue === null || splitRawValue === undefined || splitRawValue === '' ? '-' : String(splitRawValue);
    const key = `${date}__${splitValue}`;

    if (!baseGroups.has(key)) {
      baseGroups.set(key, {
        date,
        splitValue,
        sums: {},
      });
    }

    collectNumericSums(row, baseGroups.get(key)!.sums);
  });

  const totalsBySplit = new Map<string, GroupState>();
  baseGroups.forEach((group) => {
    if (!totalsBySplit.has(group.splitValue)) {
      totalsBySplit.set(group.splitValue, {
        date: 'TOTAL',
        splitValue: group.splitValue,
        sums: {},
      });
    }
    mergeGroupState(totalsBySplit.get(group.splitValue)!, group);
  });

  const rankedSplitValues = Array.from(totalsBySplit.values())
    .map((group) => ({
      splitValue: group.splitValue,
      value: resolveMetricValue(metricKey, group.sums) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .map((item) => item.splitValue);

  const topSplitValues = new Set(rankedSplitValues.slice(0, maxSeries));
  const needOthers = rankedSplitValues.length > maxSeries;

  const mergedGroups = new Map<string, GroupState>();
  baseGroups.forEach((group) => {
    const normalizedSplit = topSplitValues.has(group.splitValue) ? group.splitValue : '其他';
    if (normalizedSplit === '其他' && !needOthers) {
      return;
    }

    const key = `${group.date}__${normalizedSplit}`;
    if (!mergedGroups.has(key)) {
      mergedGroups.set(key, {
        date: group.date,
        splitValue: normalizedSplit,
        sums: {},
      });
    }
    mergeGroupState(mergedGroups.get(key)!, group);
  });

  const aggregatedRows = Array.from(mergedGroups.values())
    .map((group) => ({
      日期: group.date,
      拆分维度: group.splitValue,
      指标值: resolveMetricValue(metricKey, group.sums),
    }))
    .sort((a, b) => {
      if (a.日期 === b.日期) {
        return a.拆分维度.localeCompare(b.拆分维度, 'zh-CN');
      }
      return dayjs(a.日期).valueOf() - dayjs(b.日期).valueOf();
    });

  const dates = Array.from(new Set(aggregatedRows.map((row) => row.日期)));
  const series = Array.from(new Set(aggregatedRows.map((row) => row.拆分维度)));

  return {
    metricType: getMetricType(metricKey),
    rows: aggregatedRows,
    dates,
    series,
  };
}

export function formatMetricValue(value: number | null, metricType: ReturnType<typeof getMetricType>) {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  if (metricType === 'percent') {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (metricType === 'currency') {
    return value.toFixed(2);
  }

  return `${Math.round(value)}`;
}
