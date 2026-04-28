import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MetricType } from '../config/metricConfig';
import { formatMetricValue } from '../utils/aggregation';

interface AggregatedRow {
  日期: string;
  拆分维度: string;
  指标值: number | null;
  当日付费人数: number | null;
  当日付费成本: number | null;
  当日付费ROI: number | null;
  '3日付费率': number | null;
}

interface DataTableProps {
  rows: AggregatedRow[];
  splitDimensionLabel: string;
  metricLabel: string;
  metricType: MetricType;
}

function numSorter(a: number | null, b: number | null) {
  return (a ?? -Infinity) - (b ?? -Infinity);
}

export default function DataTable({ rows, splitDimensionLabel, metricLabel, metricType }: DataTableProps) {
  const columns: ColumnsType<AggregatedRow> = [
    { title: '日期', dataIndex: '日期', key: '日期', width: 140, sorter: (a, b) => a.日期.localeCompare(b.日期, 'zh-CN'), defaultSortOrder: 'ascend' },
    { title: splitDimensionLabel, dataIndex: '拆分维度', key: '拆分维度', width: 180, sorter: (a, b) => a.拆分维度.localeCompare(b.拆分维度, 'zh-CN') },
    {
      title: metricLabel,
      dataIndex: '指标值',
      key: '指标值',
      width: 160,
      sorter: (a, b) => numSorter(a.指标值, b.指标值),
      render: (value: number | null) => formatMetricValue(value, metricType),
    },
    {
      title: '当日付费人数',
      dataIndex: '当日付费人数',
      key: '当日付费人数',
      width: 130,
      sorter: (a, b) => numSorter(a.当日付费人数, b.当日付费人数),
      render: (value: number | null) => formatMetricValue(value, 'number'),
    },
    {
      title: '当日付费成本',
      dataIndex: '当日付费成本',
      key: '当日付费成本',
      width: 130,
      sorter: (a, b) => numSorter(a.当日付费成本, b.当日付费成本),
      render: (value: number | null) => formatMetricValue(value, 'currency'),
    },
    {
      title: '当日付费ROI',
      dataIndex: '当日付费ROI',
      key: '当日付费ROI',
      width: 130,
      sorter: (a, b) => numSorter(a.当日付费ROI, b.当日付费ROI),
      render: (value: number | null) => formatMetricValue(value, 'percent'),
    },
    {
      title: '3日付费率',
      dataIndex: '3日付费率',
      key: '3日付费率',
      width: 130,
      sorter: (a, b) => numSorter(a['3日付费率'], b['3日付费率']),
      render: (value: number | null) => formatMetricValue(value, 'percent'),
    },
  ];

  return (
    <Table<AggregatedRow>
      rowKey={(record) => `${record.日期}-${record.拆分维度}`}
      columns={columns}
      dataSource={rows}
      pagination={false}
      sticky
      scroll={{ x: 'max-content', y: 480 }}
      size="small"
    />
  );
}
