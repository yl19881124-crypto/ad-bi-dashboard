import { Segmented, Table } from 'antd';
import { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { DataRow } from '../types';
import { normalizeExcelDate } from '../utils/date';

type TableMode = 'summary' | 'daily';

interface DataTableProps {
  rows: DataRow[];
  splitDimensionLabel: string;
}

interface DetailMetricValues {
  付费量级: number | null;
  付费成本: number | null;
  日均消耗: number | null;
  付费率: number | null;
  首日付费ROI: number | null;
  直播间进入率: number | null;
  连麦量级: number | null;
  连麦成本: number | null;
  '直播间➡️连麦率': number | null;
  付费连麦转化率: number | null;
  首次付费占比: number | null;
}

interface SummaryRow extends DetailMetricValues {
  key: string;
  拆分维度: string;
}

interface DailyRow extends DetailMetricValues {
  key: string;
  日期: string;
  拆分维度: string;
}

const METRIC_FIELDS = [
  '当日付费人数',
  '实际消耗(元)',
  '注册_登录人数',
  '当日付费金额(元)',
  '进入直播间人数',
  '当日连麦人数',
  '首日付费连麦人数',
  '当日首次付费人数',
  '当日付费次数',
] as const;

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function formatOneDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toFixed(1);
}

function formatTwoDecimals(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function buildMetrics(sums: Record<string, number>, dayCount: number, isDaily: boolean): DetailMetricValues {
  const 付费人数 = sums.当日付费人数 ?? 0;
  const 消耗 = sums['实际消耗(元)'] ?? 0;
  const 登录人数 = sums['注册_登录人数'] ?? 0;
  const 首日付费金额 = sums['当日付费金额(元)'] ?? 0;
  const 进入直播间人数 = sums.进入直播间人数 ?? 0;
  const 连麦人数 = sums.当日连麦人数 ?? 0;
  const 首日付费连麦人数 = sums.首日付费连麦人数 ?? 0;
  const 首次付费人数 = sums.当日首次付费人数 ?? 0;
  const 付费次数 = sums.当日付费次数 ?? 0;

  return {
    付费量级: isDaily ? 付费人数 : safeDivide(付费人数, dayCount),
    付费成本: safeDivide(消耗, 付费人数),
    日均消耗: isDaily ? 消耗 : safeDivide(消耗, dayCount),
    付费率: safeDivide(付费人数, 登录人数),
    首日付费ROI: safeDivide(首日付费金额, 消耗),
    直播间进入率: safeDivide(进入直播间人数, 登录人数),
    连麦量级: isDaily ? 连麦人数 : safeDivide(连麦人数, dayCount),
    连麦成本: safeDivide(消耗, 连麦人数),
    '直播间➡️连麦率': safeDivide(连麦人数, 进入直播间人数),
    付费连麦转化率: safeDivide(首日付费连麦人数, 连麦人数),
    首次付费占比: safeDivide(首次付费人数, 付费次数),
  };
}

function buildSummaryRows(rows: DataRow[], splitDimension: string): SummaryRow[] {
  const groups = new Map<string, { sums: Record<string, number>; days: Set<string> }>();

  rows.forEach((row) => {
    const splitValue = row[splitDimension] === null || row[splitDimension] === undefined || String(row[splitDimension]).trim() === ''
      ? '未知'
      : String(row[splitDimension]).trim();
    const date = normalizeExcelDate(row.日期);
    if (!date) return;

    if (!groups.has(splitValue)) groups.set(splitValue, { sums: {}, days: new Set<string>() });
    const group = groups.get(splitValue)!;
    group.days.add(date);

    METRIC_FIELDS.forEach((field) => {
      group.sums[field] = (group.sums[field] ?? 0) + toNumber(row[field]);
    });
  });

  return Array.from(groups.entries())
    .map(([splitValue, state]) => ({
      key: splitValue,
      拆分维度: splitValue,
      ...buildMetrics(state.sums, state.days.size, false),
    }))
    .sort((a, b) => (b.付费量级 ?? -Infinity) - (a.付费量级 ?? -Infinity));
}

function buildDailyRows(rows: DataRow[], splitDimension: string): DailyRow[] {
  const groups = new Map<string, { date: string; splitValue: string; sums: Record<string, number> }>();

  rows.forEach((row) => {
    const date = normalizeExcelDate(row.日期);
    if (!date) return;
    const splitValue = row[splitDimension] === null || row[splitDimension] === undefined || String(row[splitDimension]).trim() === ''
      ? '未知'
      : String(row[splitDimension]).trim();

    const key = `${date}-${splitValue}`;
    if (!groups.has(key)) groups.set(key, { date, splitValue, sums: {} });
    const group = groups.get(key)!;

    METRIC_FIELDS.forEach((field) => {
      group.sums[field] = (group.sums[field] ?? 0) + toNumber(row[field]);
    });
  });

  return Array.from(groups.values())
    .map((group) => ({
      key: `${group.date}-${group.splitValue}`,
      日期: group.date,
      拆分维度: group.splitValue,
      ...buildMetrics(group.sums, 1, true),
    }))
    .sort((a, b) => {
      if (a.日期 !== b.日期) return a.日期.localeCompare(b.日期, 'zh-CN');
      return (b.付费量级 ?? -Infinity) - (a.付费量级 ?? -Infinity);
    });
}

function metricColumns<T extends DetailMetricValues>(): ColumnsType<T> {
  return [
    { title: '付费量级', dataIndex: '付费量级', key: '付费量级', width: 120, sorter: (a, b) => (a.付费量级 ?? -Infinity) - (b.付费量级 ?? -Infinity), render: formatOneDecimal },
    { title: '付费成本', dataIndex: '付费成本', key: '付费成本', width: 120, sorter: (a, b) => (a.付费成本 ?? -Infinity) - (b.付费成本 ?? -Infinity), render: formatTwoDecimals },
    { title: '日均消耗', dataIndex: '日均消耗', key: '日均消耗', width: 120, sorter: (a, b) => (a.日均消耗 ?? -Infinity) - (b.日均消耗 ?? -Infinity), render: formatTwoDecimals },
    { title: '付费率', dataIndex: '付费率', key: '付费率', width: 120, sorter: (a, b) => (a.付费率 ?? -Infinity) - (b.付费率 ?? -Infinity), render: formatPercent },
    { title: '首日付费ROI', dataIndex: '首日付费ROI', key: '首日付费ROI', width: 120, sorter: (a, b) => (a.首日付费ROI ?? -Infinity) - (b.首日付费ROI ?? -Infinity), render: formatPercent },
    { title: '直播间进入率', dataIndex: '直播间进入率', key: '直播间进入率', width: 130, sorter: (a, b) => (a.直播间进入率 ?? -Infinity) - (b.直播间进入率 ?? -Infinity), render: formatPercent },
    { title: '连麦量级', dataIndex: '连麦量级', key: '连麦量级', width: 120, sorter: (a, b) => (a.连麦量级 ?? -Infinity) - (b.连麦量级 ?? -Infinity), render: formatOneDecimal },
    { title: '连麦成本', dataIndex: '连麦成本', key: '连麦成本', width: 120, sorter: (a, b) => (a.连麦成本 ?? -Infinity) - (b.连麦成本 ?? -Infinity), render: formatTwoDecimals },
    { title: '直播间➡️连麦率', dataIndex: '直播间➡️连麦率', key: '直播间➡️连麦率', width: 140, sorter: (a, b) => (a['直播间➡️连麦率'] ?? -Infinity) - (b['直播间➡️连麦率'] ?? -Infinity), render: formatPercent },
    { title: '付费连麦转化率', dataIndex: '付费连麦转化率', key: '付费连麦转化率', width: 140, sorter: (a, b) => (a.付费连麦转化率 ?? -Infinity) - (b.付费连麦转化率 ?? -Infinity), render: formatPercent },
    { title: '首次付费占比', dataIndex: '首次付费占比', key: '首次付费占比', width: 140, sorter: (a, b) => (a.首次付费占比 ?? -Infinity) - (b.首次付费占比 ?? -Infinity), render: formatPercent },
  ];
}

export default function DataTable({ rows, splitDimensionLabel }: DataTableProps) {
  const [mode, setMode] = useState<TableMode>('summary');
  const summaryRows = useMemo(() => buildSummaryRows(rows, splitDimensionLabel), [rows, splitDimensionLabel]);
  const dailyRows = useMemo(() => buildDailyRows(rows, splitDimensionLabel), [rows, splitDimensionLabel]);

  const summaryColumns: ColumnsType<SummaryRow> = useMemo(
    () => [
      {
        title: splitDimensionLabel,
        dataIndex: '拆分维度',
        key: '拆分维度',
        fixed: 'left',
        width: 180,
        sorter: (a, b) => a.拆分维度.localeCompare(b.拆分维度, 'zh-CN'),
      },
      ...metricColumns<SummaryRow>(),
    ],
    [splitDimensionLabel],
  );

  const dailyColumns: ColumnsType<DailyRow> = useMemo(
    () => [
      {
        title: '日期',
        dataIndex: '日期',
        key: '日期',
        fixed: 'left',
        width: 140,
        sorter: (a, b) => a.日期.localeCompare(b.日期, 'zh-CN'),
        defaultSortOrder: 'ascend',
      },
      {
        title: splitDimensionLabel,
        dataIndex: '拆分维度',
        key: '拆分维度',
        fixed: 'left',
        width: 180,
        sorter: (a, b) => a.拆分维度.localeCompare(b.拆分维度, 'zh-CN'),
      },
      ...metricColumns<DailyRow>(),
    ],
    [splitDimensionLabel],
  );

  return (
    <>
      <Segmented
        style={{ marginBottom: 12 }}
        options={[{ label: '汇总数据', value: 'summary' }, { label: '分日数据', value: 'daily' }]}
        value={mode}
        onChange={(value) => setMode(value as TableMode)}
      />
      {mode === 'summary' ? (
        <Table<SummaryRow>
          rowKey="key"
          columns={summaryColumns}
          dataSource={summaryRows}
          pagination={false}
          sticky
          scroll={{ x: 'max-content', y: 480 }}
          size="small"
        />
      ) : (
        <Table<DailyRow>
          rowKey="key"
          columns={dailyColumns}
          dataSource={dailyRows}
          pagination={false}
          sticky
          scroll={{ x: 'max-content', y: 480 }}
          size="small"
        />
      )}
    </>
  );
}
