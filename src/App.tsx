import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Layout,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ConfigBar from './components/ConfigBar';
import DataTable from './components/DataTable';
import DiagnosisDrawer from './components/DiagnosisDrawer';
import FieldPanel from './components/FieldPanel';
import ReviewSummaryDrawer from './components/ReviewSummaryDrawer';
import TrendChart from './components/TrendChart';
import { T0_METRIC_CONFIGS, T0_METRIC_KEYS, getMetricPrecision, getMetricType } from './config/metricConfig';
import { dimensionFields as defaultDimensions, metricFields as defaultMetrics, mockRows } from './mock/data';
import type { DataRow, DimensionField, MetricField } from './types';
import type { DiagnosisResult } from './types/diagnosis';
import type { ReviewSummaryData } from './types/reviewSummary';
import { aggregateRowsByDateAndDimension, calculateMetricByRange, filterRows, formatMetricValue, getFilterOptions } from './utils/aggregation';
import { runDiagnosis } from './utils/diagnosis';
import { normalizeExcelDate } from './utils/date';
import { buildMarkdownFileName, generateReviewSummary, getOverviewStatus } from './utils/reviewSummary';

const { Header, Sider, Content } = Layout;
const DEFAULT_SHEET_NAME = '分账户底表';
const CORE_CARD_METRICS = ['日均付费人数', '当日付费成本', '当日付费ROI', '日均连麦人数', '当日连麦成本', '3日付费成本', '3日付费ROI', '3日付费率', '首次付费占比'];
const ADVANCED_FILTER_FIELDS = ['渠道', '代理', '版位', '操作系统', '账户命名', '优化目标', '出价方式', '账户ID', '账户名称', '广告组ID', '广告组名称'];
const T0_OVERVIEW_ALL = '__ALL__';
const DIAGNOSIS_DEFAULT_DIMENSIONS = ['渠道', '代理', '版位', '操作系统', '账户命名', '优化目标', '出价方式', '账户ID', '广告组ID'];

const SCENARIOS = [
  { key: '整体付费趋势', name: '整体付费趋势', dimension: '渠道', metric: '当日付费人数' },
  { key: '渠道成本分析', name: '渠道成本分析', dimension: '渠道', metric: '当日付费成本' },
  { key: '渠道ROI分析', name: '渠道 ROI 分析', dimension: '渠道', metric: '当日付费ROI' },
  { key: '版位付费分析', name: '版位付费分析', dimension: '版位', metric: '当日付费人数' },
  { key: '操作系统转化分析', name: '操作系统转化分析', dimension: '操作系统', metric: '3日付费率' },
  { key: '代理成本分析', name: '代理成本分析', dimension: '代理', metric: '当日付费成本' },
  { key: '账户命名分析', name: '账户命名分析', dimension: '账户命名', metric: '当日付费ROI' },
  { key: '广告组下钻', name: '广告组下钻', dimension: '广告组名称', metric: '当日付费成本' },
];

const FIXED_DIMENSION_FIELDS = ['日期', ...ADVANCED_FILTER_FIELDS];
const dateNamePattern = /(日期|时间|date|day)/i;
const invalidFieldPattern = /^(字段\d+|未命名字段\d+|column\d+|col\d+|unnamed:?\s*\d*)$/i;

type DateDebugRow = { key: string; rawValue: string; rawType: string; normalizedDate: string };

const uniqList = (list: string[]) => Array.from(new Set(list));
const isMeaninglessHeader = (header: string) => !header.trim() || header.trim() === '-' || invalidFieldPattern.test(header.trim());
const isNumericValue = (value: unknown) =>
  typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' ? value.trim() !== '' && Number.isFinite(Number(value)) : false;
const normalizeDateValue = (value: unknown): string | number | null => {
  if (value === null || value === undefined || value === '') return null;
  return normalizeExcelDate(value) ?? String(value);
};

function parseWorksheet(file: RcFile) {
  return file.arrayBuffer().then((buffer: ArrayBuffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    let sheetName = DEFAULT_SHEET_NAME;
    if (!workbook.SheetNames.includes(DEFAULT_SHEET_NAME)) {
      sheetName = workbook.SheetNames[0];
      message.warning(`未找到 sheet「${DEFAULT_SHEET_NAME}」，已自动读取第一个 sheet「${sheetName}」。`);
    }

    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, { header: 1, raw: true, defval: '' });
    const [headerRow = [], ...bodyRows] = matrix;
    const rawHeaders = headerRow.map((item) => String(item ?? '').trim());
    const validHeaders = uniqList(rawHeaders.filter((header) => !isMeaninglessHeader(header)));

    const rows: DataRow[] = bodyRows
      .map((row) => {
        const mappedRow: DataRow = {};
        validHeaders.forEach((header) => {
          const sourceIndex = rawHeaders.indexOf(header);
          const cellValue = row[sourceIndex];
          mappedRow[header] = cellValue === undefined || cellValue === '' ? null : (cellValue as string | number | null);
        });
        return mappedRow;
      })
      .filter((row) => Object.values(row).some((value) => value !== null && String(value).trim() !== ''));

    const availableFixedDimensions = FIXED_DIMENSION_FIELDS.filter((field) => validHeaders.includes(field));
    const dateField = availableFixedDimensions.includes('日期') ? '日期' : validHeaders.find((header) => dateNamePattern.test(header));
    const dimensions = uniqList([...availableFixedDimensions, ...(dateField ? ['日期'] : [])].filter((field) => field && !isMeaninglessHeader(field)));
    const metricCandidates = validHeaders.filter((header) => !dimensions.includes(header));

    const metricFields = metricCandidates.filter((header) => {
      const nonEmptyValues = rows.map((row) => row[header]).filter((value) => value !== null && String(value).trim() !== '');
      if (!nonEmptyValues.length) return false;
      const numericCount = nonEmptyValues.filter((value) => isNumericValue(value)).length;
      return numericCount / nonEmptyValues.length >= 0.6;
    });

    const normalizedRows = rows.map((row) => {
      const normalizedRow: DataRow = { ...row };
      if (dateField && normalizedRow[dateField] !== undefined) normalizedRow[dateField] = normalizeDateValue(normalizedRow[dateField]);
      if (dateField && dateField !== '日期') normalizedRow.日期 = normalizedRow[dateField] ?? null;
      return normalizedRow;
    });

    return {
      rows: normalizedRows,
      dimensions,
      metrics: uniqList(metricFields),
      sheetName,
      dateDebugRows: normalizedRows.slice(0, 10).map((row, index) => ({
        key: `${index}`,
        rawValue: row.日期 === null || row.日期 === undefined ? '' : String(row.日期),
        rawType: row.日期 === null ? 'null' : typeof row.日期,
        normalizedDate: normalizeExcelDate(row.日期) || '-',
      })),
    };
  });
}

const buildMetricFields = (parsedMetrics: string[]): MetricField[] => [
  ...T0_METRIC_CONFIGS.map((metric) => ({ key: metric.key, name: metric.name, tag: 'T0' as const })),
  ...parsedMetrics.filter((field) => !T0_METRIC_KEYS.has(field)).map((field) => ({ key: field, name: field, tag: 'T1' as const })),
];

function getPreviousPeriod(dateRange: [string, string] | null): [string, string] | null {
  if (!dateRange) return null;
  const [start, end] = dateRange;
  const days = dayjs(end).diff(dayjs(start), 'day') + 1;
  return [dayjs(start).subtract(days, 'day').format('YYYY-MM-DD'), dayjs(start).subtract(1, 'day').format('YYYY-MM-DD')];
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(mockRows.map((row) => ({ ...row })));
  const [dimensionFields, setDimensionFields] = useState<DimensionField[]>(defaultDimensions);
  const [metricFields, setMetricFields] = useState<MetricField[]>(defaultMetrics);
  const [parsedSheetName, setParsedSheetName] = useState(DEFAULT_SHEET_NAME);
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [dateDebugRows, setDateDebugRows] = useState<DateDebugRow[]>([]);

  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0].key);
  const [selectedDimension, setSelectedDimension] = useState('版位');
  const [selectedMetric, setSelectedMetric] = useState('当日付费人数');
  const [selectedDateRange, setSelectedDateRange] = useState<[string, string] | null>(['2026-04-20', '2026-04-26']);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [t0OverviewFilterField, setT0OverviewFilterField] = useState(T0_OVERVIEW_ALL);
  const [t0OverviewFilterValues, setT0OverviewFilterValues] = useState<string[]>([]);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisMetric, setDiagnosisMetric] = useState('当日付费人数');
  const [diagnosisDimensions, setDiagnosisDimensions] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  const filterOptions = useMemo(() => getFilterOptions(rows, ADVANCED_FILTER_FIELDS), [rows]);
  const availableT0FilterFields = useMemo(
    () => ADVANCED_FILTER_FIELDS.filter((field) => filterOptions[field]),
    [filterOptions],
  );
  const rowsAfterGlobalFilters = useMemo(() => filterRows(rows, selectedFilters), [rows, selectedFilters]);
  const t0FilterOptions = useMemo(() => {
    if (t0OverviewFilterField === T0_OVERVIEW_ALL) return [];
    return getFilterOptions(rowsAfterGlobalFilters, [t0OverviewFilterField])[t0OverviewFilterField] ?? [];
  }, [rowsAfterGlobalFilters, t0OverviewFilterField]);
  const t0OverviewRows = useMemo(() => {
    if (t0OverviewFilterField === T0_OVERVIEW_ALL || t0OverviewFilterValues.length === 0) return rowsAfterGlobalFilters;
    return filterRows(rowsAfterGlobalFilters, { [t0OverviewFilterField]: t0OverviewFilterValues });
  }, [rowsAfterGlobalFilters, t0OverviewFilterField, t0OverviewFilterValues]);
  const hasT0OverviewData = useMemo(
    () => t0OverviewRows.some((row) => {
      const normalizedDate = normalizeExcelDate(row.日期);
      if (!selectedDateRange) return Boolean(normalizedDate);
      return Boolean(normalizedDate && normalizedDate >= selectedDateRange[0] && normalizedDate <= selectedDateRange[1]);
    }),
    [t0OverviewRows, selectedDateRange],
  );

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls,.csv',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const parsed = await parseWorksheet(file);
          const parsedDimensions = parsed.dimensions.map((field) => ({ key: field, name: field, isDate: field === '日期' }));
          const parsedMetrics = buildMetricFields(parsed.metrics);

          setRows(parsed.rows);
          setHasUploadedData(true);
          setParsedSheetName(parsed.sheetName);
          setDateDebugRows(parsed.dateDebugRows);
          setDimensionFields(parsedDimensions);
          setMetricFields(parsedMetrics);
          setSelectedFilters({});
          setT0OverviewFilterField(T0_OVERVIEW_ALL);
          setT0OverviewFilterValues([]);

          if (!parsedDimensions.some((item) => item.key === selectedDimension)) setSelectedDimension(parsedDimensions.find((item) => item.key !== '日期')?.key ?? '日期');
          if (!parsedMetrics.some((item) => item.key === selectedMetric)) setSelectedMetric(parsedMetrics[0]?.key ?? '当日付费人数');

          message.success(`读取成功：${file.name}（${parsed.rows.length} 行，${parsed.dimensions.length + parsed.metrics.length} 列）。`);
        } catch {
          message.error('文件解析失败，请检查 .xlsx/.xls/.csv 文件内容。');
        }
        return false;
      },
    }),
    [selectedDimension, selectedMetric],
  );

  const aggregatedResult = useMemo(
    () =>
      aggregateRowsByDateAndDimension({
        rows,
        splitDimension: selectedDimension,
        metricKey: selectedMetric,
        dateRange: selectedDateRange,
        filters: selectedFilters,
      }),
    [rows, selectedDimension, selectedMetric, selectedDateRange, selectedFilters],
  );

  const previousRange = useMemo(() => getPreviousPeriod(selectedDateRange), [selectedDateRange]);
  const diagnosisAvailableDimensions = useMemo(
    () => DIAGNOSIS_DEFAULT_DIMENSIONS.filter((field) => filterOptions[field]),
    [filterOptions],
  );
  const diagnosisResult: DiagnosisResult | null = useMemo(
    () => {
      if (!hasUploadedData || !selectedDateRange) return null;
      return (
      runDiagnosis({
        rows: t0OverviewRows,
        metricKey: diagnosisMetric,
        currentRange: selectedDateRange,
        dimensions: diagnosisDimensions,
      })
      );
    },
    [hasUploadedData, t0OverviewRows, diagnosisMetric, selectedDateRange, diagnosisDimensions],
  );

  const overviewCards = useMemo(() => {
    return CORE_CARD_METRICS.map((metricKey) => {
      const current = calculateMetricByRange(t0OverviewRows, metricKey, selectedDateRange);
      const previous = calculateMetricByRange(t0OverviewRows, metricKey, previousRange);
      const changePct = current !== null && previous !== null && previous !== 0 ? (current - previous) / previous : null;

      const status = getOverviewStatus(metricKey, changePct);

      return {
        key: metricKey,
        metricKey,
        type: getMetricType(metricKey),
        current,
        previous,
        changePct,
        status,
      };
    });
  }, [t0OverviewRows, selectedDateRange, previousRange]);
  const detailRows = useMemo(
    () =>
      rowsAfterGlobalFilters.filter((row) => {
        const normalizedDate = normalizeExcelDate(row.日期);
        if (!normalizedDate) return false;
        if (!selectedDateRange) return true;
        return normalizedDate >= selectedDateRange[0] && normalizedDate <= selectedDateRange[1];
      }),
    [rowsAfterGlobalFilters, selectedDateRange],
  );

  const reviewDiagnosisMetric = useMemo(() => {
    if (T0_METRIC_KEYS.has(diagnosisMetric)) return diagnosisMetric;
    const worseItem = overviewCards
      .filter((item) => item.status === '变差' && item.changePct !== null)
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))[0];
    if (worseItem) return worseItem.metricKey;
    if (T0_METRIC_KEYS.has(selectedMetric)) return selectedMetric;
    return '当日付费人数';
  }, [diagnosisMetric, overviewCards, selectedMetric]);

  const reviewDiagnosisDimensions = useMemo(
    () => (diagnosisDimensions.length > 0 ? diagnosisDimensions : diagnosisAvailableDimensions),
    [diagnosisAvailableDimensions, diagnosisDimensions],
  );

  const reviewDiagnosisResult = useMemo(() => {
    if (!hasUploadedData || !selectedDateRange) return null;
    if (
      diagnosisResult &&
      diagnosisResult.summary.metricKey === reviewDiagnosisMetric &&
      reviewDiagnosisDimensions.length === diagnosisDimensions.length
    ) {
      return diagnosisResult;
    }
    return runDiagnosis({
      rows: t0OverviewRows,
      metricKey: reviewDiagnosisMetric,
      currentRange: selectedDateRange,
      dimensions: reviewDiagnosisDimensions,
    });
  }, [
    hasUploadedData,
    selectedDateRange,
    diagnosisResult,
    reviewDiagnosisMetric,
    reviewDiagnosisDimensions,
    diagnosisDimensions.length,
    t0OverviewRows,
  ]);

  const scenarioName = SCENARIOS.find((item) => item.key === selectedScenario)?.name ?? selectedScenario;
  const dateText = selectedDateRange ? `${selectedDateRange[0]} ~ ${selectedDateRange[1]}` : '全部日期';
  const emptyText = '暂无数据，请调整筛选条件';
  const globalFilterSummary = useMemo(() => {
    const activeItems = Object.entries(selectedFilters).filter(([, values]) => values.length > 0);
    if (!activeItems.length) return '无';
    return activeItems.map(([field, values]) => `${field} = ${values.join('、')}`).join('；');
  }, [selectedFilters]);
  const t0OverviewFilterSummary =
    t0OverviewFilterField === T0_OVERVIEW_ALL || t0OverviewFilterValues.length === 0
      ? '无'
      : `${t0OverviewFilterField} = ${t0OverviewFilterValues.join('、')}`;

  const reviewSummaryData: ReviewSummaryData | null = useMemo(() => {
    if (!hasUploadedData) return null;
    return generateReviewSummary({
      context: {
        dateRange: selectedDateRange,
        scenario: scenarioName,
        splitDimension: selectedDimension,
        selectedMetric,
        globalFilterSummary,
        t0OverviewFilterSummary,
        dataRowCount: rowsAfterGlobalFilters.length,
        sheetName: parsedSheetName,
      },
      overviewItems: overviewCards,
      diagnosisResult: reviewDiagnosisResult,
      selectedMetric,
      rows: t0OverviewRows,
      currentRange: selectedDateRange,
    });
  }, [
    hasUploadedData,
    selectedDateRange,
    scenarioName,
    selectedDimension,
    selectedMetric,
    globalFilterSummary,
    t0OverviewFilterSummary,
    rowsAfterGlobalFilters.length,
    parsedSheetName,
    overviewCards,
    reviewDiagnosisResult,
    t0OverviewRows,
  ]);

  const trendChartKey = useMemo(
    () => JSON.stringify({ splitDimension: selectedDimension, metric: selectedMetric, dateRange: selectedDateRange, rowCount: aggregatedResult.rows.length }),
    [selectedDimension, selectedMetric, selectedDateRange, aggregatedResult.rows.length],
  );

  const previewColumns: ColumnsType<DataRow> = useMemo(() => {
    const visibleFields = dimensionFields.map((field) => field.key).concat(metricFields.map((field) => field.key)).slice(0, 8);
    return visibleFields.map((field) => ({
      title: field,
      dataIndex: field,
      key: field,
      width: 140,
      render: (value: string | number | null) => (field === '日期' ? normalizeExcelDate(value) || '-' : value ?? '-'),
    }));
  }, [dimensionFields, metricFields]);

  const previewRows = useMemo(() => rows.slice(0, 10).map((row, index) => ({ key: `${index}`, ...row })), [rows]);
  const currentMetricType = getMetricType(selectedMetric);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={320} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
        <FieldPanel dimensions={dimensionFields} metrics={metricFields} />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Space>
            <Typography.Title level={4} style={{ margin: 0 }}>投放数据分析 BI 看板 v0.4.0</Typography.Title>
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadOutlined />}>上传 Excel/CSV</Button>
            </Upload>
          </Space>
        </Header>

        <Content style={{ padding: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ConfigBar
              dimensions={dimensionFields.filter((item) => item.key !== '日期')}
              metrics={metricFields}
              scenarios={SCENARIOS}
              selectedScenario={selectedScenario}
              selectedDimension={selectedDimension}
              selectedMetric={selectedMetric}
              selectedDateRange={selectedDateRange}
              filterOptions={filterOptions}
              selectedFilters={selectedFilters}
              onScenarioChange={(value) => {
                setSelectedScenario(value);
                const scene = SCENARIOS.find((item) => item.key === value);
                if (!scene) return;
                if (dimensionFields.some((item) => item.key === scene.dimension)) setSelectedDimension(scene.dimension);
                if (metricFields.some((item) => item.key === scene.metric)) setSelectedMetric(scene.metric);
              }}
              onDimensionChange={setSelectedDimension}
              onMetricChange={setSelectedMetric}
              onDateRangeChange={setSelectedDateRange}
              onFilterChange={(field, values) => setSelectedFilters((prev) => ({ ...prev, [field]: values }))}
              onClearFilters={() => setSelectedFilters({})}
            />

            <Card
              bordered={false}
              title={
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span>T0 核心指标概览</span>
                  <Space>
                    <Button
                      type="primary"
                      onClick={() => {
                        if (!hasUploadedData) message.warning('请先上传 Excel 数据');
                        setReviewOpen(true);
                      }}
                    >
                      生成复盘摘要
                    </Button>
                    <Button
                      type="primary"
                      onClick={() => {
                        if (!hasUploadedData) message.warning('请先上传 Excel 数据');
                        const defaultMetric = T0_METRIC_KEYS.has(selectedMetric) ? selectedMetric : '当日付费成本';
                        setDiagnosisMetric(defaultMetric);
                        setDiagnosisDimensions(diagnosisAvailableDimensions);
                        setDiagnosisOpen(true);
                      }}
                    >
                      诊断 T0 指标
                    </Button>
                  </Space>
                </Space>
              }
            >
              <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
                <Typography.Text type="secondary">当前范围：{selectedDateRange ? `${selectedDateRange[0]} 至 ${selectedDateRange[1]}` : '全部日期'}</Typography.Text>
                <Typography.Text type="secondary">全局筛选：{globalFilterSummary}</Typography.Text>
                <Typography.Text type="secondary">T0概览筛选：{t0OverviewFilterSummary}</Typography.Text>
              </Space>
              <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 16 }}>
                <Space wrap>
                  <Select
                    style={{ width: 220 }}
                    value={t0OverviewFilterField}
                    options={[{ label: '全部', value: T0_OVERVIEW_ALL }, ...availableT0FilterFields.map((field) => ({ label: field, value: field }))]}
                    onChange={(value) => {
                      setT0OverviewFilterField(value);
                      setT0OverviewFilterValues([]);
                    }}
                    placeholder="维度字段"
                  />
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    maxTagCount="responsive"
                    style={{ minWidth: 280 }}
                    value={t0OverviewFilterValues}
                    options={t0FilterOptions.map((value) => ({ label: value, value }))}
                    onChange={(values) => setT0OverviewFilterValues(values)}
                    placeholder={t0OverviewFilterField === T0_OVERVIEW_ALL ? '维度值（请选择维度字段）' : '维度值（可多选）'}
                    disabled={t0OverviewFilterField === T0_OVERVIEW_ALL || t0FilterOptions.length === 0}
                  />
                  <Button
                    onClick={() => {
                      setT0OverviewFilterField(T0_OVERVIEW_ALL);
                      setT0OverviewFilterValues([]);
                    }}
                  >
                    清空 T0 筛选
                  </Button>
                </Space>
                {t0OverviewFilterField !== T0_OVERVIEW_ALL && t0OverviewFilterValues.length > 0 && (
                  <Space wrap>
                    <Typography.Text type="secondary">T0概览筛选：</Typography.Text>
                    <Tag color="blue">{`${t0OverviewFilterField} = ${t0OverviewFilterValues.join('、')}`}</Tag>
                  </Space>
                )}
              </Space>
              <div style={{ overflowX: 'auto' }}>
                <Row gutter={[12, 12]} wrap>
                  {overviewCards.map((item) => (
                    <Col key={item.key} xs={24} sm={12} md={8} lg={6}>
                      <Card size="small" title={item.metricKey}>
                        <Space direction="vertical" size={4}>
                          <Typography.Text>
                            当前：
                            {item.type === 'number' && getMetricPrecision(item.metricKey) > 0 && item.current !== null
                              ? item.current.toFixed(getMetricPrecision(item.metricKey))
                              : formatMetricValue(item.current, item.type)}
                          </Typography.Text>
                          <Typography.Text type="secondary">
                            上一周期：
                            {item.type === 'number' && getMetricPrecision(item.metricKey) > 0 && item.previous !== null
                              ? item.previous.toFixed(getMetricPrecision(item.metricKey))
                              : formatMetricValue(item.previous, item.type)}
                          </Typography.Text>
                          <Typography.Text type="secondary">环比：{formatMetricValue(item.changePct, 'percent')}</Typography.Text>
                          <Tag color={item.status === '变好' ? 'green' : item.status === '变差' ? 'red' : 'default'}>{item.status}</Tag>
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
              {!hasT0OverviewData && (
                <Alert style={{ marginTop: 12 }} showIcon type="warning" message="当前 T0 筛选条件下暂无数据" />
              )}
            </Card>

            <Card title={`趋势图（${scenarioName} / ${selectedDimension} / ${selectedMetric} / ${dateText}）`} bordered={false}>
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

            <Card title={`明细表（${selectedDimension}）`} bordered={false}>
              {detailRows.length > 0 ? (
                <DataTable rows={detailRows} splitDimensionLabel={selectedDimension} />
              ) : (
                <Empty description={emptyText} />
              )}
            </Card>

            <Card title="上传解析结果" bordered={false}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions size="small" column={3} bordered>
                  <Descriptions.Item label="总行数">{rows.length}</Descriptions.Item>
                  <Descriptions.Item label="总字段数">{dimensionFields.length + metricFields.length}</Descriptions.Item>
                  <Descriptions.Item label="当前 Sheet">{parsedSheetName}</Descriptions.Item>
                </Descriptions>
                <Card size="small" title="数据预览（前 10 行）" bordered>
                  <Table columns={previewColumns} dataSource={previewRows} pagination={false} scroll={{ x: 'max-content' }} size="small" />
                </Card>
                <Collapse
                  items={[{
                    key: 'date-debug',
                    label: '日期解析调试（前 10 行）',
                    children: (
                      <Table<DateDebugRow>
                        rowKey="key"
                        columns={[
                          { title: '原始值', dataIndex: 'rawValue', key: 'rawValue', width: 220 },
                          { title: '类型', dataIndex: 'rawType', key: 'rawType', width: 120 },
                          { title: '解析后', dataIndex: 'normalizedDate', key: 'normalizedDate', width: 180 },
                        ]}
                        dataSource={dateDebugRows}
                        pagination={false}
                        size="small"
                      />
                    ),
                  }]}
                />
              </Space>
            </Card>
          </Space>
        </Content>
      </Layout>
      <DiagnosisDrawer
        open={diagnosisOpen}
        onClose={() => setDiagnosisOpen(false)}
        diagnosisMetric={diagnosisMetric}
        onDiagnosisMetricChange={setDiagnosisMetric}
        diagnosisDimensions={diagnosisDimensions}
        onDiagnosisDimensionsChange={setDiagnosisDimensions}
        availableDimensions={diagnosisAvailableDimensions}
        currentRangeText={selectedDateRange ? `${selectedDateRange[0]} 至 ${selectedDateRange[1]}` : '-'}
        previousRangeText={previousRange ? `${previousRange[0]} 至 ${previousRange[1]}` : '-'}
        result={diagnosisResult}
        emptyMessage="请先上传 Excel 数据并选择日期范围。"
        debugInfo={{
          rawRowCount: hasUploadedData ? rows.length : 0,
          filteredRowCount: hasUploadedData ? t0OverviewRows.length : 0,
          diagnosisMetric,
          dimensionCount: diagnosisDimensions.length,
        }}
      />
      <ReviewSummaryDrawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        hasUploadedData={hasUploadedData}
        summary={reviewSummaryData}
        onCopyMarkdown={async () => {
          if (!reviewSummaryData) return;
          try {
            await navigator.clipboard.writeText(reviewSummaryData.markdown);
            message.success('已复制复盘摘要');
          } catch {
            message.warning('复制失败，请手动复制');
          }
        }}
        onDownloadMarkdown={() => {
          if (!reviewSummaryData) return;
          try {
            const blob = new Blob([reviewSummaryData.markdown], { type: 'text/markdown;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = buildMarkdownFileName(selectedDateRange);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(link.href);
          } catch {
            message.error('导出失败，请重试');
          }
        }}
      />
    </Layout>
  );
}
