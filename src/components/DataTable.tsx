import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataRow } from '../types';

interface DataTableProps {
  rows: DataRow[];
}

export default function DataTable({ rows }: DataTableProps) {
  const headers = Object.keys(rows[0] ?? {});

  const columns: ColumnsType<DataRow> = headers.map((header) => ({
    title: header,
    dataIndex: header,
    key: header,
    render: (value: unknown) => (value === null || value === undefined ? '-' : String(value)),
  }));

  return <Table<DataRow> rowKey={(_: DataRow, index: number | undefined) => String(index ?? 0)} columns={columns} dataSource={rows} pagination={false} scroll={{ x: true }} />;
}
