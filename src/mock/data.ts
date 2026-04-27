import type { DataRow, DimensionField, MetricField, ParseSummary } from '../types';

export const dimensionFields: DimensionField[] = [
  { key: '日期', name: '日期' },
  { key: '版位', name: '版位' },
  { key: '渠道', name: '渠道' },
  { key: '计划', name: '计划' },
];

export const metricFields: MetricField[] = [
  { key: '当日付费人数', name: '当日付费人数', tag: 'T0' },
  { key: '展示量', name: '展示量', tag: 'T1' },
  { key: '点击量', name: '点击量', tag: 'T1' },
  { key: '消耗', name: '消耗', tag: 'T0' },
];

export const mockRows: DataRow[] = [
  { 日期: '2026-04-20', 版位: '信息流', 当日付费人数: 120, 展示量: 8800, 点击量: 430 },
  { 日期: '2026-04-21', 版位: '信息流', 当日付费人数: 138, 展示量: 9200, 点击量: 468 },
  { 日期: '2026-04-22', 版位: '开屏', 当日付费人数: 126, 展示量: 9100, 点击量: 451 },
  { 日期: '2026-04-23', 版位: '开屏', 当日付费人数: 142, 展示量: 9600, 点击量: 482 },
  { 日期: '2026-04-24', 版位: '搜索', 当日付费人数: 151, 展示量: 10200, 点击量: 510 },
  { 日期: '2026-04-25', 版位: '搜索', 当日付费人数: 146, 展示量: 10000, 点击量: 499 },
  { 日期: '2026-04-26', 版位: '推荐', 当日付费人数: 159, 展示量: 10800, 点击量: 542 },
];

export const mockSummary: ParseSummary = {
  totalRows: mockRows.length,
  totalFields: Object.keys(mockRows[0] ?? {}).length,
  sheetName: '分账户底表',
  fallbackToFirstSheet: false,
};
