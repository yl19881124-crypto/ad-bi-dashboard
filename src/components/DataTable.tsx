import { Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataRow } from '../types';

interface DataTableProps {
  rows: DataRow[];
}

const PRIORITY_COLUMNS = [
  '日期',
  '代理',
  '版位',
  '优化目标',
  '账户命名',
  '出价方式',
  '渠道',
  '操作系统',
  '账户ID',
  '账户名称',
  '广告组ID',
  '广告组名称',
  '实际消耗(元)',
  '当日付费人数',
  '当日付费金额(元)',
];

export default function DataTable({ rows }: DataTableProps) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const sortedHeaders = [
    ...PRIORITY_COLUMNS.filter((header) => headers.includes(header)),
    ...headers.filter((header) => !PRIORITY_COLUMNS.includes(header)),
  ];

  const columns: ColumnsType<DataRow> = sortedHeaders.map((header) => ({
    title: header,
    dataIndex: header,
    key: header,
    width: 180,
    ellipsis: true,
    render: (value: string | number | null) => {
      const text = value === null || value === '' ? '-' : String(value);
      return (
        <Tooltip title={text}>
          <Typography.Text ellipsis style={{ maxWidth: 150 }}>
            {text}
          </Typography.Text>
        </Tooltip>
      );
    },
  }));

  return (
    <Table<DataRow>
      rowKey={(_record: DataRow, index?: number) => String(index ?? 0)}
      columns={columns}
      dataSource={rows}
      pagination={false}
      sticky
      scroll={{ x: 'max-content', y: 480 }}
      size="small"
    />
  );
}
