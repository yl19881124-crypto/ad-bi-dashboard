import { useMemo, useState } from 'react';
import { Button, Card, Collapse, Descriptions, Layout, Space, Tag, Typography, Upload, message } from 'antd';
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

const FIXED_DIMENSION_FIELDS = [
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
];

const T0_METRIC_NAMES = [
  '落地页到达率',
  '登陆➡️直播间进入率',
  '落地页➡️直播间进入率',
  '登陆➡️当日连麦率',
  '直播间➡️当日连麦率',
  '当日连麦➡️付费连麦转化率',
  '当日付费连麦用户占比',
  '当日付费人数',
  '当日付费成本',
  '当日付费ROI',
  '3日付费成本',
  '3日付费ROI',
  '3日付费率',
];

const dateNamePattern = /(日期|时间|date|day)/i;
const invalidFieldPattern = /^(字段\d+|未命名字段\d+|column\d+|col\d+|unnamed:?\s*\d*)$/i;

function uniqList(list: string[]) {
  return Array.from(new Set(list));
}

function isMeaninglessHeader(header: string) {
  const normalized = header.trim();
  if (!normalized) {
    return true;
  }

  if (normalized === '-' || normalized === '--' || normalized === 'N/A' || normalized === 'NA') {
    return true;
  }

  return invalidFieldPattern.test(normalized);
}

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

    const rawHeaders = headerRow.map((item: string | number | Date | null) => String(item ?? '').trim());
    const validHeaders = uniqList(rawHeaders.filter((header: string) => !isMeaninglessHeader(header)));

    const rows: DataRow[] = bodyRows
      .map((row: (string | number | Date | null)[]) => {
        const mappedRow: DataRow = {};

        validHeaders.forEach((header: string) => {
          const sourceIndex = rawHeaders.indexOf(header);
          const cellValue = row[sourceIndex];
          mappedRow[header] = cellValue === undefined ? null : (cellValue as string | number | null);
        });

        return mappedRow;
      })
      .filter((row: DataRow) => Object.values(row).some((value) => value !== null && String(value).trim() !== ''));

    const availableFixedDimensions = FIXED_DIMENSION_FIELDS.filter((field) => validHeaders.includes(field));
    const dateField = availableFixedDimensions.find((field) => field === '日期')
      ? '日期'
      : validHeaders.find((header) => dateNamePattern.test(header));

    const dimensions = uniqList(
      [...availableFixedDimensions, ...(dateField ? ['日期'] : [])].filter((field) => field && !isMeaninglessHeader(field)),
    );

    const metricCandidates = validHeaders.filter((header: string) => !dimensions.includes(header));

    const metricFields = metricCandidates.filter((header: string) => {
      const nonEmptyValues = rows
        .map((row: DataRow) => row[header])
        .filter((value) => value !== null && String(value).trim() !== '');

      if (nonEmptyValues.length === 0) {
        return false;
      }

      const numericCount = nonEmptyValues.filter((value) => isNumericValue(value)).length;
      return numericCount / nonEmptyValues.length >= 0.6;
    });

    const normalizedRows = rows.map((row: DataRow) => {
      const normalizedRow: DataRow = { ...row };
      if (dateField && normalizedRow[dateField] !== undefined) {
        normalizedRow[dateField] = normalizeDateValue(normalizedRow[dateField]);
      }
      if (dateField && dateField !== '日期') {
        normalizedRow.日期 = normalizedRow[dateField] ?? null;
      }
      return normalizedRow;
    });

    return {
      rows: normalizedRows,
      dimensions,
      metrics: uniqList(metricFields),
      sheetName,
    };
  });
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(
    mockRows.map((row) => ({ ...row })) as DataRow[],
  );
  const [dimensionFields, setDimensionFields] = useState<DimensionField[]>(defaultDimensions);
  const [metricFields, setMetricFields] = useState<MetricField[]>(defaultMetrics);
  const [parsedSheetName, setParsedSheetName] = useState(DEFAULT_SHEET_NAME);

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls,.csv',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const parsed = await parseWorksheet(file);

          setRows(parsed.rows);
          setParsedSheetName(parsed.sheetName);
          setDimensionFields(
            parsed.dimensions.map((field: string) => ({
              key: field,
              name: field,
              isDate: field === '日期',
            })),
          );
          setMetricFields(
            parsed.metrics.map((field: string) => ({
              key: field,
              name: field,
              tag: T0_METRIC_NAMES.includes(field) ? 'T0' : 'T1',
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
      <Sider width={320} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
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
              <Descriptions size="small" column={3} bordered>
                <Descriptions.Item label="总行数">{rows.length}</Descriptions.Item>
                <Descriptions.Item label="总字段数">{dimensionFields.length + metricFields.length}</Descriptions.Item>
                <Descriptions.Item label="当前 Sheet">{parsedSheetName}</Descriptions.Item>
              </Descriptions>

              <Collapse
                style={{ marginTop: 16 }}
                bordered={false}
                items={[
                  {
                    key: 'recognized-details',
                    label: '查看识别详情',
                    children: (
                      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <section>
                          <Typography.Title level={5}>识别出的维度字段</Typography.Title>
                          <Space wrap>
                            {dimensionFields.map((item) => (
                              <Tag key={item.key} color="blue">
                                {item.name}
                              </Tag>
                            ))}
                          </Space>
                        </section>
                        <section>
                          <Typography.Title level={5}>识别出的指标字段</Typography.Title>
                          <Space wrap>
                            {metricFields.map((item) => (
                              <Space key={item.key} size={6}>
                                <Tag>{item.name}</Tag>
                                <Tag color={item.tag === 'T0' ? 'blue' : 'default'}>{item.tag}</Tag>
                              </Space>
                            ))}
                          </Space>
                        </section>
                      </Space>
                    ),
                  },
                ]}
              />
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
