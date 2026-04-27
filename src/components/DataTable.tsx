import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataRow } from '../types';

interface DataTableProps {
  rows: DataRow[];
}

export default function DataTable({ rows }: DataTableProps) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const columns: ColumnsType<DataRow> = headers.map((header) => ({
    title: header,
    dataIndex: header,
    key: header,
    render: (value: string | number | null) => (value === null || value === '' ? '-' : String(value)),
  }));

  return (
    <Table<DataRow>
      rowKey={(_record: DataRow, index?: number) => String(index ?? 0)}
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 'max-content' }}
    />
  );
}
