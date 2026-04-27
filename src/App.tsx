import { useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Layout, Space, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ConfigBar from './components/ConfigBar';
import DataTable from './components/DataTable';
import FieldPanel from './components/FieldPanel';
import TrendChart from './components/TrendChart';
import { T0_METRIC_CONFIGS, T0_METRIC_KEYS, getMetricType } from './config/metricConfig';
import { dimensionFields as defaultDimensions, metricFields as defaultMetrics, mockRows } from './mock/data';
import type { DataRow, DimensionField, MetricField } from './types';
import { aggregateRowsByDateAndDimension } from './utils/aggregation';
import { normalizeExcelDate } from './utils/date';

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

  const normalized = normalizeExcelDate(value);
  if (normalized) {
    return normalized;
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

function buildMetricFields(parsedMetrics: string[]): MetricField[] {
  const t0Metrics: MetricField[] = T0_METRIC_CONFIGS.map((metric) => ({
    key: metric.key,
    name: metric.name,
    tag: 'T0',
  }));

  const t1Metrics: MetricField[] = parsedMetrics
    .filter((field) => !T0_METRIC_KEYS.has(field))
    .map((field) => ({
      key: field,
      name: field,
      tag: 'T1',
    }));

  return [...t0Metrics, ...t1Metrics];
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(mockRows.map((row) => ({ ...row })));
  const [dimensionFields, setDimensionFields] = useState<DimensionField[]>(defaultDimensions);
  const [metricFields, setMetricFields] = useState<MetricField[]>(defaultMetrics);
  const [parsedSheetName, setParsedSheetName] = useState(DEFAULT_SHEET_NAME);
  const [hasUploadedData, setHasUploadedData] = useState(false);

  const [selectedDimension, setSelectedDimension] = useState('版位');
  const [selectedMetric, setSelectedMetric] = useState('当日付费人数');
  const [selectedDateRange, setSelectedDateRange] = useState<[Dayjs, Dayjs] | null>([dayjs('2026-04-20'), dayjs('2026-04-26')]);

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls,.csv',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const parsed = await parseWorksheet(file);

          const parsedDimensions = parsed.dimensions.map((field: string) => ({
            key: field,
            name: field,
            isDate: field === '日期',
          }));

          const parsedMetrics = buildMetricFields(parsed.metrics);

          setRows(parsed.rows);
          setHasUploadedData(true);
          setParsedSheetName(parsed.sheetName);
          setDimensionFields(parsedDimensions);
          setMetricFields(parsedMetrics);

          if (!parsedDimensions.some((item) => item.key === selectedDimension)) {
            setSelectedDimension(parsedDimensions.find((item) => item.key !== '日期')?.key ?? '日期');
          }
          if (!parsedMetrics.some((item) => item.key === selectedMetric)) {
            setSelectedMetric(parsedMetrics[0]?.key ?? '当日付费人数');
          }

          message.success(`读取成功：${file.name}（${parsed.rows.length} 行，${parsed.dimensions.length + parsed.metrics.length} 列）。`);
        } catch (error) {
          message.error('文件解析失败，请检查 .xlsx/.xls/.csv 文件内容。');
        }
        return false;
      },
    }),
    [selectedDimension, selectedMetric],
  );

  const aggregatedResult = useMemo(
    () => aggregateRowsByDateAndDimension({ rows, splitDimension: selectedDimension, metricKey: selectedMetric, dateRange: selectedDateRange }),
    [rows, selectedDimension, selectedMetric, selectedDateRange],
  );
  const trendChartKey = useMemo(
    () =>
      JSON.stringify({
        splitDimension: selectedDimension,
        metric: selectedMetric,
        dateRange: selectedDateRange?.map((item) => item.format('YYYY-MM-DD')) ?? null,
        rowCount: aggregatedResult.rows.length,
        series: aggregatedResult.series,
      }),
    [selectedDimension, selectedMetric, selectedDateRange, aggregatedResult.rows.length, aggregatedResult.series],
  );

  const currentMetricType = getMetricType(selectedMetric);
  const emptyText = '暂无数据，请调整筛选条件';

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
            <ConfigBar
              dimensions={dimensionFields.filter((item) => item.key !== '日期')}
              metrics={metricFields}
              selectedDimension={selectedDimension}
              selectedMetric={selectedMetric}
              selectedDateRange={selectedDateRange}
              onDimensionChange={setSelectedDimension}
              onMetricChange={setSelectedMetric}
              onDateRangeChange={setSelectedDateRange}
            />

            <Card title={`趋势图（折线图 / X轴：日期 / 拆分维度：${selectedDimension} / 指标：${selectedMetric}）`} bordered={false}>
              {!hasUploadedData && <Alert type="info" showIcon message="当前展示 mock 数据，上传 Excel 后将自动切换真实数据。" style={{ marginBottom: 12 }} />}
              {aggregatedResult.rows.length > 0 ? (
                <TrendChart
                  rows={aggregatedResult.rows}
                  dates={aggregatedResult.dates}
                  series={aggregatedResult.series}
                  splitDimensionLabel={selectedDimension}
                  metricLabel={selectedMetric}
                  metricType={currentMetricType}
                  chartKey={trendChartKey}
                />
              ) : (
                <Empty description={emptyText} />
              )}
            </Card>

            <Card title={`明细表（聚合后：日期 + ${selectedDimension} + ${selectedMetric}）`} bordered={false}>
              {aggregatedResult.rows.length > 0 ? (
                <DataTable
                  rows={aggregatedResult.rows}
                  splitDimensionLabel={selectedDimension}
                  metricLabel={selectedMetric}
                  metricType={currentMetricType}
                />
              ) : (
                <Empty description={emptyText} />
              )}
            </Card>

            <Card title="上传解析结果" bordered={false}>
              <Descriptions size="small" column={3} bordered>
                <Descriptions.Item label="总行数">{rows.length}</Descriptions.Item>
                <Descriptions.Item label="总字段数">{dimensionFields.length + metricFields.length}</Descriptions.Item>
                <Descriptions.Item label="当前 Sheet">{parsedSheetName}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
}
