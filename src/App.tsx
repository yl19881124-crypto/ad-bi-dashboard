import { useMemo, useState } from 'react';
import { Button, Card, Descriptions, Layout, message, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ConfigBar from './components/ConfigBar';
import DataTable from './components/DataTable';
import FieldPanel from './components/FieldPanel';
import TrendChart from './components/TrendChart';
import { dimensionFields as defaultDimensions, metricFields as defaultMetrics, mockRows } from './mock/data';
import type { DataRow, DimensionField, MetricField } from './types';

const { Header, Sider, Content } = Layout;
const DEFAULT_SHEET_NAME = '分账户底表';

const dateNamePattern = /(日期|时间|date|day)/i;

function isNumericValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && Number.isFinite(Number(trimmed));
  }

  return false;
}

function normalizeDateValue(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (isNumericValue(trimmed)) {
      const parsed = XLSX.SSF.parse_date_code(Number(trimmed));
      if (parsed) {
        return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }

    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString().slice(0, 10);
    }

    return trimmed;
  }

  return String(value);
}

function parseWorksheet(file: RcFile) {
  return file.arrayBuffer().then((buffer: ArrayBuffer) => {
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
    });

    let sheetName = DEFAULT_SHEET_NAME;
    if (!workbook.SheetNames.includes(DEFAULT_SHEET_NAME)) {
      sheetName = workbook.SheetNames[0];
      message.warning(`未找到 sheet「${DEFAULT_SHEET_NAME}」，已自动读取第一个 sheet「${sheetName}」。`);
    }

    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    const [headerRow = [], ...bodyRows] = matrix;
    const headers = headerRow.map((item: string | number | Date | null, index: number) => {
      const text = String(item ?? '').trim();
      return text || `未命名字段${index + 1}`;
    });

    const rows: DataRow[] = bodyRows
      .map((row: (string | number | Date | null)[]) => {
        const mappedRow: DataRow = {};

        headers.forEach((header: string, index: number) => {
          const cellValue = row[index];
          mappedRow[header] = cellValue === undefined ? null : (cellValue as string | number | null);
        });

        return mappedRow;
      })
      .filter((row: DataRow) => Object.values(row).some((value) => value !== null && String(value).trim() !== ''));

    const dateFields = headers.filter((header: string) => dateNamePattern.test(header));

    const metricFields = headers.filter((header: string) => {
      if (dateFields.includes(header)) {
        return false;
      }

      const nonEmptyValues = rows
        .map((row: DataRow) => row[header])
        .filter((value) => value !== null && String(value).trim() !== '');
      if (nonEmptyValues.length === 0) {
        return false;
      }

      const numericCount = nonEmptyValues.filter((value) => isNumericValue(value)).length;
      return numericCount / nonEmptyValues.length >= 0.6;
    });

    const dimensions = headers.filter((header: string) => !metricFields.includes(header));

    const normalizedRows = rows.map((row: DataRow) => {
      const normalizedRow: DataRow = { ...row };
      dateFields.forEach((field: string) => {
        normalizedRow[field] = normalizeDateValue(normalizedRow[field]);
      });
      return normalizedRow;
    });

    return {
      rows: normalizedRows,
      dimensions,
      metrics: metricFields,
      dateFields,
    };
  });
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(
    mockRows.map((row) => ({ ...row })) as DataRow[],
  );
  const [dimensionFields, setDimensionFields] = useState<DimensionField[]>(defaultDimensions);
  const [metricFields, setMetricFields] = useState<MetricField[]>(defaultMetrics);

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls,.csv',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const parsed = await parseWorksheet(file);

          setRows(parsed.rows);
          setDimensionFields(
            parsed.dimensions.map((field: string) => ({
              key: field,
              name: field,
              isDate: parsed.dateFields.includes(field),
            })),
          );
          setMetricFields(
            parsed.metrics.map((field: string) => ({
              key: field,
              name: field,
              tag: 'T1',
            })),
          );

          message.success(`读取成功：${file.name}（${parsed.rows.length} 行，${parsed.dimensions.length + parsed.metrics.length} 列）。`);
        } catch (error) {
          message.error('文件解析失败，请检查 .xlsx/.xls/.csv 文件内容。');
        }
        return false;
      },
    }),
    [],
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
        <FieldPanel dimensions={dimensionFields} metrics={metricFields} />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Space>
            <Typography.Title level={4} style={{ margin: 0 }}>
              投放数据分析 BI 看板
            </Typography.Title>
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadOutlined />}>
                上传 Excel/CSV
              </Button>
            </Upload>
          </Space>
        </Header>

        <Content style={{ padding: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ConfigBar dimensions={dimensionFields} metrics={metricFields} />

            <Card title="趋势图（默认：折线图 / X轴：日期 / 拆分维度：版位 / 指标：当日付费人数）" bordered={false}>
              <TrendChart rows={mockRows} />
            </Card>

            <Card title="上传解析结果" bordered={false}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="总行数">{rows.length}</Descriptions.Item>
                <Descriptions.Item label="总字段数">{dimensionFields.length + metricFields.length}</Descriptions.Item>
                <Descriptions.Item label="识别维度字段" span={2}>
                  {dimensionFields.map((item: DimensionField) => item.name).join('、') || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="识别指标字段" span={2}>
                  {metricFields.map((item: MetricField) => item.name).join('、') || '-'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="数据预览（前 20 行）" bordered={false}>
              <DataTable rows={rows.slice(0, 20)} />
            </Card>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
}
