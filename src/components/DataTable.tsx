import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AdDataRow } from '../types';

interface DataTableProps {
  rows: AdDataRow[];
}

const columns: ColumnsType<AdDataRow> = [
  { title: '日期', dataIndex: '日期', key: '日期' },
  { title: '版位', dataIndex: '版位', key: '版位' },
  { title: '当日付费人数', dataIndex: '当日付费人数', key: '当日付费人数' },
  { title: '展示量', dataIndex: '展示量', key: '展示量' },
  { title: '点击量', dataIndex: '点击量', key: '点击量' },
];

export default function DataTable({ rows }: DataTableProps) {
  return <Table<AdDataRow> rowKey={(record: AdDataRow) => `${record.日期}-${record.版位}`} columns={columns} dataSource={rows} pagination={false} />;
}
