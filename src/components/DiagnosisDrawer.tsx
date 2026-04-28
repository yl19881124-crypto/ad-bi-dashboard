import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getMetricDirectionText, metricConfigMap, T0_METRIC_CONFIGS } from '../config/metricConfig';
import type { DiagnosisResult } from '../types/diagnosis';
import { formatMetricValue } from '../utils/aggregation';

type DiagnosisRow = NonNullable<DiagnosisResult['dimensionResults']>[number]['rows'][number];
type SecondaryRow = NonNullable<DiagnosisRow['secondaryResults']>[number]['rows'][number];

interface Props {
  open: boolean;
  onClose: () => void;
  diagnosisMetric: string;
  onDiagnosisMetricChange: (value: string) => void;
  diagnosisDimensions: string[];
  onDiagnosisDimensionsChange: (values: string[]) => void;
  availableDimensions: string[];
  currentRangeText: string;
  previousRangeText: string;
  result: DiagnosisResult | null;
  emptyMessage: string;
  debugInfo: {
    rawRowCount: number;
    filteredRowCount: number;
    diagnosisMetric: string;
    dimensionCount: number;
  };
  validationScope: {
    scenario: string;
    splitDimension: string;
    chartMetric: string;
    advancedFilters: string;
    t0Filters: string;
    sheetName: string;
    previousFilteredRowCount: number;
  };
}

function buildFormulaText(metricKey: string) {
  const cfg = metricConfigMap.get(metricKey);
  if (!cfg) return '-';
  if (cfg.mode === 'source') return `SUM(${cfg.sourceField})`;
  if (cfg.mode === 'daily_average_source') return `SUM(${cfg.sourceField}) / 当前周期有数据的天数`;
  return `SUM(${cfg.numerator}) / SUM(${cfg.denominator})`;
}

function isFormulaMetric(metricKey: string) {
  return metricConfigMap.get(metricKey)?.mode === 'formula';
}

function safeNumber(value: number | null, type: 'number' | 'currency' | 'percent') {
  if (value === null || !Number.isFinite(value)) return '-';
  if (type === 'currency') return value.toFixed(2);
  if (type === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${Math.abs(value) >= 100 ? Math.round(value) : value.toFixed(1)}`;
}

export default function DiagnosisDrawer(props: Props) {
  const {
    open,
    onClose,
    diagnosisMetric,
    onDiagnosisMetricChange,
    diagnosisDimensions,
    onDiagnosisDimensionsChange,
    availableDimensions,
    currentRangeText,
    previousRangeText,
    result,
    emptyMessage,
    debugInfo,
    validationScope,
  } = props;
  const [panelOpen, setPanelOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<{ row: DiagnosisRow; dimension: string } | null>(null);

  const formulaMetric = isFormulaMetric(diagnosisMetric);

  const columns: ColumnsType<DiagnosisRow> = useMemo(() => {
    const base: ColumnsType<DiagnosisRow> = [
      { title: '维度值', dataIndex: 'dimensionValue', key: 'dimensionValue', width: 140 },
      { title: '当前周期指标值', dataIndex: 'currentMetric', key: 'currentMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      { title: '上一周期指标值', dataIndex: 'previousMetric', key: 'previousMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      {
        title: '变化值',
        key: 'changeValue',
        render: (_, row) => {
          const delta = row.currentMetric !== null && row.previousMetric !== null ? row.currentMetric - row.previousMetric : null;
          return formatMetricValue(delta, result?.summary.metricType ?? 'number');
        },
      },
      { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => formatMetricValue(value, 'percent') },
      { title: '贡献度', dataIndex: 'contribution', key: 'contribution', render: (value) => formatMetricValue(value, 'percent') },
    ];

    const formulaColumns: ColumnsType<DiagnosisRow> = formulaMetric
      ? [
          { title: '分子当前值', dataIndex: 'numeratorCurrent', key: 'numeratorCurrent', render: (value) => safeNumber(value, 'currency') },
          { title: '分子上期值', dataIndex: 'numeratorPrevious', key: 'numeratorPrevious', render: (value) => safeNumber(value, 'currency') },
          { title: '分母当前值', dataIndex: 'denominatorCurrent', key: 'denominatorCurrent', render: (value) => safeNumber(value, 'currency') },
          { title: '分母上期值', dataIndex: 'denominatorPrevious', key: 'denominatorPrevious', render: (value) => safeNumber(value, 'currency') },
        ]
      : [];

    return [
      ...base,
      ...formulaColumns,
      {
        title: '判断原因',
        dataIndex: 'reason',
        key: 'reason',
        render: (value, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{value}</Typography.Text>
            {row.sampleWarning && <Tag color="gold">样本量较小，波动仅供参考</Tag>}
          </Space>
        ),
      },
      { title: '建议动作', dataIndex: 'action', key: 'action', width: 240 },
      {
        title: '操作',
        key: 'actionBtn',
        width: 140,
        fixed: 'right',
        render: (_, row) => (
          <Button type="link" onClick={() => setDetailRow({ row, dimension: diagnosisDimensions[0] ?? '-' })}>
            查看计算明细
          </Button>
        ),
      },
    ];
  }, [diagnosisDimensions, formulaMetric, result?.summary.metricType]);

  const secondaryColumns: ColumnsType<SecondaryRow> = useMemo(
    () => [
      { title: '维度值', dataIndex: 'dimensionValue', key: 'dimensionValue', width: 140 },
      { title: '当前周期指标值', dataIndex: 'currentMetric', key: 'currentMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      { title: '上一周期指标值', dataIndex: 'previousMetric', key: 'previousMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => formatMetricValue(value, 'percent') },
      { title: '贡献度', dataIndex: 'contribution', key: 'contribution', render: (value) => formatMetricValue(value, 'percent') },
      { title: '具体判断原因', dataIndex: 'reason', key: 'reason', width: 360 },
    ],
    [result?.summary.metricType],
  );

  const metricCfg = metricConfigMap.get(diagnosisMetric);

  return (
    <>
      <Drawer title="T0 指标诊断分析" width={1240} open={open} onClose={onClose} destroyOnClose styles={{ body: { overflowY: 'auto' } }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card size="small" title="诊断配置" extra={<Button onClick={() => setPanelOpen(true)}>查看口径校验</Button>}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Space wrap>
                <Typography.Text>诊断指标：</Typography.Text>
                <Select style={{ width: 260 }} value={diagnosisMetric} onChange={onDiagnosisMetricChange} options={T0_METRIC_CONFIGS.map((item) => ({ label: item.name, value: item.key }))} />
              </Space>
              <Typography.Text type="secondary">当前周期：{currentRangeText}</Typography.Text>
              <Typography.Text type="secondary">上一周期：{previousRangeText}</Typography.Text>
              <Space wrap>
                <Typography.Text>下钻维度：</Typography.Text>
                <Select mode="multiple" style={{ minWidth: 560 }} value={diagnosisDimensions} options={availableDimensions.map((field) => ({ label: field, value: field }))} onChange={onDiagnosisDimensionsChange} maxTagCount="responsive" />
              </Space>
            </Space>
          </Card>

          <Card size="small" title="指标口径说明">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="指标名称">{diagnosisMetric}</Descriptions.Item>
              <Descriptions.Item label="口径">{buildFormulaText(diagnosisMetric)}</Descriptions.Item>
              <Descriptions.Item label="分子字段">{metricCfg?.mode === 'formula' ? metricCfg.numerator : metricCfg?.sourceField ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="分母字段">{metricCfg?.mode === 'formula' ? metricCfg.denominator : metricCfg?.mode === 'daily_average_source' ? '当前周期有数据的天数' : '-'}</Descriptions.Item>
              <Descriptions.Item label="是否为日均口径">{metricCfg?.mode === 'daily_average_source' ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="好坏方向">{getMetricDirectionText(diagnosisMetric)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="诊断状态">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="当前原始数据行数">{debugInfo.rawRowCount}</Descriptions.Item>
              <Descriptions.Item label="当前筛选后行数">{debugInfo.filteredRowCount}</Descriptions.Item>
              <Descriptions.Item label="当前诊断指标">{debugInfo.diagnosisMetric}</Descriptions.Item>
              <Descriptions.Item label="当前下钻维度数量">{debugInfo.dimensionCount}</Descriptions.Item>
            </Descriptions>
          </Card>

          {!result ? (
            <Empty description={emptyMessage} />
          ) : result.error ? (
            <Alert type="warning" showIcon message={result.error} />
          ) : (
            <Card title="下钻维度贡献排行" size="small">
              <Tabs
                items={result.dimensionResults.map((item) => ({
                  key: item.dimension,
                  label: item.dimension,
                  children: (
                    <Table size="small" rowKey="key" columns={columns} dataSource={item.rows} pagination={{ pageSize: 8 }} scroll={{ x: 1800 }}
                      expandable={{
                        expandedRowRender: (row) =>
                          row.secondaryResults && row.secondaryResults.length > 0 ? (
                            <Tabs items={row.secondaryResults.map((sub) => ({
                              key: `${row.key}-${sub.dimension}`,
                              label: `按${sub.dimension}下钻`,
                              children: <Table size="small" rowKey="key" columns={secondaryColumns} dataSource={sub.rows} pagination={false} scroll={{ x: 1200 }} />,
                            }))} />
                          ) : <Typography.Text type="secondary">暂无可用二级下钻结果</Typography.Text>,
                      }}
                    />
                  ),
                }))}
              />
            </Card>
          )}
        </Space>
      </Drawer>

      <Drawer title="数据校验 / 口径解释" width={840} open={panelOpen} onClose={() => setPanelOpen(false)}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card size="small" title="模块 1：当前分析范围">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="当前日期范围">{currentRangeText}</Descriptions.Item>
              <Descriptions.Item label="上一周期日期范围">{previousRangeText}</Descriptions.Item>
              <Descriptions.Item label="当前分析场景">{validationScope.scenario}</Descriptions.Item>
              <Descriptions.Item label="当前拆分维度">{validationScope.splitDimension}</Descriptions.Item>
              <Descriptions.Item label="当前图表指标">{validationScope.chartMetric}</Descriptions.Item>
              <Descriptions.Item label="当前高级筛选条件">{validationScope.advancedFilters}</Descriptions.Item>
              <Descriptions.Item label="当前 T0 概览筛选条件">{validationScope.t0Filters}</Descriptions.Item>
              <Descriptions.Item label="当前 Sheet 名称">{validationScope.sheetName}</Descriptions.Item>
              <Descriptions.Item label="原始数据总行数">{debugInfo.rawRowCount}</Descriptions.Item>
              <Descriptions.Item label="当前筛选后行数">{debugInfo.filteredRowCount}</Descriptions.Item>
              <Descriptions.Item label="上一周期筛选后行数">{validationScope.previousFilteredRowCount}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="模块 2：当前指标口径">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="指标名称">{diagnosisMetric}</Descriptions.Item>
              <Descriptions.Item label="指标类型">{result?.summary.metricType ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="计算方式">{buildFormulaText(diagnosisMetric)}</Descriptions.Item>
              <Descriptions.Item label="分子字段">{result?.summary.numeratorField ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="分母字段">{result?.summary.denominatorField ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="好坏方向">{getMetricDirectionText(diagnosisMetric)}</Descriptions.Item>
              <Descriptions.Item label="格式化方式">{result?.summary.metricType === 'currency' ? '保留 2 位小数' : result?.summary.metricType === 'number' ? '整数或 1 位小数' : '保留 2 位小数并加 %'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="模块 3：当前周期 vs 上一周期计算明细">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="当前周期指标值">{formatMetricValue(result?.summary.currentValue ?? null, result?.summary.metricType ?? 'number')}</Descriptions.Item>
              <Descriptions.Item label="上一周期指标值">{formatMetricValue(result?.summary.previousValue ?? null, result?.summary.metricType ?? 'number')}</Descriptions.Item>
              <Descriptions.Item label="变化值">{formatMetricValue(result?.summary.changeValue ?? null, result?.summary.metricType ?? 'number')}</Descriptions.Item>
              <Descriptions.Item label="变化率">{formatMetricValue(result?.summary.changeRate ?? null, 'percent')}</Descriptions.Item>
              <Descriptions.Item label="状态">{result?.summary.status ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="当前周期分子求和">{safeNumber(result?.dimensionResults?.[0]?.rows?.reduce((acc, row) => acc + row.numeratorCurrent, 0) ?? null, 'currency')}</Descriptions.Item>
              <Descriptions.Item label="当前周期分母求和/天数">{safeNumber(result?.dimensionResults?.[0]?.rows?.reduce((acc, row) => acc + row.denominatorCurrent, 0) ?? null, 'currency')}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="模块 4：贡献度解释">
            {formulaMetric ? (
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                公式类指标的贡献度会结合指标变化、分子分母变化和样本规模综合排序。建议重点查看：指标变化率、分子变化、分母变化、当前周期样本规模。
              </Typography.Paragraph>
            ) : (
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                贡献度计算方式：当前维度值变化量 / 所有同方向变化量之和。若总变化方向不一致或分母为 0，则显示 "-"。
              </Typography.Paragraph>
            )}
          </Card>
        </Space>
      </Drawer>

      <Modal title="查看计算明细" open={Boolean(detailRow)} onCancel={() => setDetailRow(null)} onOk={() => setDetailRow(null)} width={700}>
        {!detailRow || !result ? (
          <Empty description="暂无明细" />
        ) : (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="维度">{`${detailRow.dimension} = ${detailRow.row.dimensionValue}`}</Descriptions.Item>
              <Descriptions.Item label="当前周期指标值">{formatMetricValue(detailRow.row.currentMetric, result.summary.metricType)}</Descriptions.Item>
              <Descriptions.Item label="上一周期指标值">{formatMetricValue(detailRow.row.previousMetric, result.summary.metricType)}</Descriptions.Item>
              <Descriptions.Item label="变化值">{formatMetricValue((detailRow.row.currentMetric ?? 0) - (detailRow.row.previousMetric ?? 0), result.summary.metricType)}</Descriptions.Item>
              <Descriptions.Item label="变化率">{formatMetricValue(detailRow.row.changeRate, 'percent')}</Descriptions.Item>
              <Descriptions.Item label="贡献度">{formatMetricValue(detailRow.row.contribution, 'percent')}</Descriptions.Item>
            </Descriptions>
            <Divider />
            {formulaMetric ? (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="当前周期分子">{safeNumber(detailRow.row.numeratorCurrent, 'currency')}</Descriptions.Item>
                <Descriptions.Item label="当前周期分母">{safeNumber(detailRow.row.denominatorCurrent, 'currency')}</Descriptions.Item>
                <Descriptions.Item label="上一周期分子">{safeNumber(detailRow.row.numeratorPrevious, 'currency')}</Descriptions.Item>
                <Descriptions.Item label="上一周期分母">{safeNumber(detailRow.row.denominatorPrevious, 'currency')}</Descriptions.Item>
                <Descriptions.Item label="判断原因">{detailRow.row.reason}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                贡献度解释：{detailRow.row.dimensionValue} 变化 {(detailRow.row.currentMetric ?? 0) - (detailRow.row.previousMetric ?? 0)}，在同方向变化项中的占比为 {formatMetricValue(detailRow.row.contribution, 'percent')}。
              </Typography.Paragraph>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
