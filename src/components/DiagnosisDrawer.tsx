import { useMemo } from 'react';
import { Alert, Card, Descriptions, Drawer, Empty, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { T0_METRIC_CONFIGS } from '../config/metricConfig';
import type { DiagnosisResult } from '../types/diagnosis';
import { formatMetricValue } from '../utils/aggregation';

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
  } = props;

  const columns: ColumnsType<NonNullable<DiagnosisResult['dimensionResults']>[number]['rows'][number]> = useMemo(
    () => [
      { title: '维度值', dataIndex: 'dimensionValue', key: 'dimensionValue', width: 140 },
      { title: '当前周期指标值', dataIndex: 'currentMetric', key: 'currentMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      { title: '上一周期指标值', dataIndex: 'previousMetric', key: 'previousMetric', render: (value) => formatMetricValue(value, result?.summary.metricType ?? 'number') },
      { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => formatMetricValue(value, 'percent') },
      { title: '分子当前值', dataIndex: 'numeratorCurrent', key: 'numeratorCurrent', render: (value) => value.toFixed(2) },
      { title: '分子上期值', dataIndex: 'numeratorPrevious', key: 'numeratorPrevious', render: (value) => value.toFixed(2) },
      { title: '分母当前值', dataIndex: 'denominatorCurrent', key: 'denominatorCurrent', render: (value) => value.toFixed(2) },
      { title: '分母上期值', dataIndex: 'denominatorPrevious', key: 'denominatorPrevious', render: (value) => value.toFixed(2) },
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
      { title: '建议动作', dataIndex: 'action', key: 'action', width: 220 },
    ],
    [result?.summary.metricType],
  );

  return (
    <Drawer title="T0 指标诊断分析" width={1160} open={open} onClose={onClose} destroyOnClose>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="诊断配置">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text>诊断指标：</Typography.Text>
              <Select
                style={{ width: 260 }}
                value={diagnosisMetric}
                onChange={onDiagnosisMetricChange}
                options={T0_METRIC_CONFIGS.map((item) => ({ label: item.name, value: item.key }))}
              />
            </Space>
            <Typography.Text type="secondary">当前周期：{currentRangeText}</Typography.Text>
            <Typography.Text type="secondary">上一周期：{previousRangeText}</Typography.Text>
            <Space wrap>
              <Typography.Text>下钻维度：</Typography.Text>
              <Select
                mode="multiple"
                style={{ minWidth: 560 }}
                value={diagnosisDimensions}
                options={availableDimensions.map((field) => ({ label: field, value: field }))}
                onChange={onDiagnosisDimensionsChange}
                maxTagCount="responsive"
              />
            </Space>
          </Space>
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
          <>
            <Card title="核心结论" size="small">
              <Typography.Paragraph style={{ marginBottom: 0 }}>{result.conclusion}</Typography.Paragraph>
            </Card>

            <Card title="指标变化概览" size="small">
              <Descriptions bordered size="small" column={4}>
                <Descriptions.Item label="当前周期指标值">{formatMetricValue(result.summary.currentValue, result.summary.metricType)}</Descriptions.Item>
                <Descriptions.Item label="上一周期指标值">{formatMetricValue(result.summary.previousValue, result.summary.metricType)}</Descriptions.Item>
                <Descriptions.Item label="变化率">{formatMetricValue(result.summary.changeRate, 'percent')}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={result.summary.status === '变好' ? 'green' : result.summary.status === '变差' ? 'red' : 'default'}>{result.summary.status}</Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="下钻维度贡献排行" size="small">
              <Tabs
                items={result.dimensionResults.map((item) => ({
                  key: item.dimension,
                  label: item.dimension,
                  children: (
                    <Table
                      size="small"
                      rowKey="key"
                      columns={columns}
                      dataSource={item.rows}
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 1500 }}
                    />
                  ),
                }))}
              />
            </Card>

            <Card title="建议排查方向" size="small">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.suggestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Space>
    </Drawer>
  );
}
