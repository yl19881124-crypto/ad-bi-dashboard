import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MetricType } from '../config/metricConfig';
import { formatMetricValue } from '../utils/aggregation';

interface AggregatedRow {
  日期: string;
  拆分维度: string;
  指标值: number | null;
}

interface DataTableProps {
  rows: AggregatedRow[];
  splitDimensionLabel: string;
  metricLabel: string;
  metricType: MetricType;
}

export default function DataTable({ rows, splitDimensionLabel, metricLabel, metricType }: DataTableProps) {
  const columns: ColumnsType<AggregatedRow> = [
    { title: '日期', dataIndex: '日期', key: '日期', width: 180 },
    { title: splitDimensionLabel, dataIndex: '拆分维度', key: '拆分维度', width: 180 },
    {
      title: metricLabel,
      dataIndex: '指标值',
      key: '指标值',
      width: 180,
      render: (value: number | null) => formatMetricValue(value, metricType),
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
