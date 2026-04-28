import { Button, Card, Collapse, Descriptions, Drawer, Empty, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReviewSummaryData } from '../types/reviewSummary';

interface Props {
  open: boolean;
  onClose: () => void;
  hasUploadedData: boolean;
  summary: ReviewSummaryData | null;
  onCopyMarkdown: () => void;
  onDownloadMarkdown: () => void;
}

function renderMetricValue(value: number | null, metricType: string): string {
  if (value === null || !Number.isFinite(value)) return '暂无数据';
  if (metricType === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (metricType === 'currency') return value.toFixed(2);
  return `${Math.round(value)}`;
}

export default function ReviewSummaryDrawer(props: Props) {
  const { open, onClose, hasUploadedData, summary, onCopyMarkdown, onDownloadMarkdown } = props;

  const overviewColumns: ColumnsType<ReviewSummaryData['overviewItems'][number]> = [
    { title: '指标', dataIndex: 'metricKey', key: 'metricKey', width: 150 },
    { title: '当前周期', dataIndex: 'current', key: 'current', render: (value, row) => renderMetricValue(value, row.type) },
    { title: '上一周期', dataIndex: 'previous', key: 'previous', render: (value, row) => (value === null ? '暂无上一周期数据' : renderMetricValue(value, row.type)) },
    { title: '环比', dataIndex: 'changePct', key: 'changePct', render: (value) => (value === null ? '暂无上一周期数据' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`) },
    { title: '状态', dataIndex: 'status', key: 'status', render: (value) => <Tag color={value === '变好' ? 'green' : value === '变差' ? 'red' : 'default'}>{value}</Tag> },
  ];

  const dragColumns: ColumnsType<ReviewSummaryData['dragItems'][number]> = [
    { title: '一级维度', dataIndex: 'primaryDimension', key: 'primaryDimension' },
    { title: '一级维度值', dataIndex: 'primaryValue', key: 'primaryValue' },
    { title: '当前周期值', dataIndex: 'currentMetric', key: 'currentMetric', render: (value) => (value === null ? '暂无数据' : value.toFixed(2)) },
    { title: '上一周期值', dataIndex: 'previousMetric', key: 'previousMetric', render: (value) => (value === null ? '暂无数据' : value.toFixed(2)) },
    { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => (value === null ? '暂无上一周期数据' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`) },
    { title: '二级路径', dataIndex: 'secondaryPath', key: 'secondaryPath', width: 260 },
    { title: '判断原因', dataIndex: 'reason', key: 'reason', width: 320 },
  ];

  return (
    <Drawer title="投放数据复盘摘要" width={1180} open={open} onClose={onClose} destroyOnClose styles={{ body: { overflowY: 'auto' } }}>
      {!hasUploadedData ? (
        <Empty description="请先上传 Excel 数据后再生成复盘摘要。" />
      ) : !summary ? (
        <Empty description="暂无可用复盘数据，请调整筛选条件后重试。" />
      ) : (
        <Tabs
          items={[
            {
              key: 'visual',
              label: '可视化摘要',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Card title="一、基础信息" size="small">
                    <Descriptions bordered size="small" column={2}>
                      <Descriptions.Item label="数据周期">{summary.context.dateRange ? `${summary.context.dateRange[0]} 至 ${summary.context.dateRange[1]}` : '全部日期'}</Descriptions.Item>
                      <Descriptions.Item label="当前分析场景">{summary.context.scenario}</Descriptions.Item>
                      <Descriptions.Item label="拆分维度">{summary.context.splitDimension}</Descriptions.Item>
                      <Descriptions.Item label="当前指标">{summary.context.selectedMetric}</Descriptions.Item>
                      <Descriptions.Item label="高级筛选条件" span={2}>{summary.context.globalFilterSummary}</Descriptions.Item>
                      <Descriptions.Item label="T0 概览筛选条件" span={2}>{summary.context.t0OverviewFilterSummary}</Descriptions.Item>
                      <Descriptions.Item label="数据行数">{summary.context.dataRowCount}</Descriptions.Item>
                      <Descriptions.Item label="Sheet 名称">{summary.context.sheetName}</Descriptions.Item>
                    </Descriptions>
                  </Card>

                  <Card title="二、T0 核心指标概览" size="small">
                    <Table rowKey="key" size="small" columns={overviewColumns} dataSource={summary.overviewItems} pagination={false} scroll={{ x: 900 }} />
                  </Card>

                  <Card title="三、核心结论" size="small">
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {summary.coreConclusions.map((item) => (
                        <li key={item}>
                          <Typography.Paragraph style={{ marginBottom: 8 }}>{item}</Typography.Paragraph>
                        </li>
                      ))}
                    </ol>
                  </Card>

                  <Card title="四、关键证据" size="small">
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {summary.evidenceTextLines.map((item) => (
                        <li key={item}>
                          <Typography.Paragraph style={{ marginBottom: 8 }}>{item}</Typography.Paragraph>
                        </li>
                      ))}
                    </ol>
                    {summary.evidenceSections.length > 0 ? (
                      <Collapse
                        style={{ marginTop: 12 }}
                        items={summary.evidenceSections.map((section) => ({
                          key: section.dimension,
                          label: `${section.dimension} Top 5`,
                          children: (
                            <Table
                              size="small"
                              rowKey="key"
                              pagination={false}
                              dataSource={section.rows}
                              scroll={{ x: 1400 }}
                              columns={[
                                { title: section.dimension, dataIndex: 'dimensionValue', key: 'dimensionValue', width: 180 },
                                { title: '当前周期指标值', dataIndex: 'currentValue', key: 'currentValue', render: (value) => renderMetricValue(value, summary.overviewItems.find((item) => item.metricKey === summary.context.selectedMetric)?.type ?? 'number') },
                                { title: '上一周期指标值', dataIndex: 'previousValue', key: 'previousValue', render: (value) => renderMetricValue(value, summary.overviewItems.find((item) => item.metricKey === summary.context.selectedMetric)?.type ?? 'number') },
                                { title: '变化值', dataIndex: 'changeValue', key: 'changeValue', render: (value) => renderMetricValue(value, summary.overviewItems.find((item) => item.metricKey === summary.context.selectedMetric)?.type ?? 'number') },
                                { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => (value === null ? '暂无上一周期数据' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`) },
                                { title: '贡献度', dataIndex: 'contribution', key: 'contribution', render: (value) => (value === null ? '暂无法计算' : `${(value * 100).toFixed(2)}%`) },
                                { title: '分子当前', dataIndex: 'numeratorCurrent', key: 'numeratorCurrent', render: (value) => Number(value).toFixed(2) },
                                { title: '分子上期', dataIndex: 'numeratorPrevious', key: 'numeratorPrevious', render: (value) => Number(value).toFixed(2) },
                                { title: '分母当前', dataIndex: 'denominatorCurrent', key: 'denominatorCurrent', render: (value) => Number(value).toFixed(2) },
                                { title: '分母上期', dataIndex: 'denominatorPrevious', key: 'denominatorPrevious', render: (value) => Number(value).toFixed(2) },
                                { title: '判断原因', dataIndex: 'reason', key: 'reason', width: 280 },
                              ]}
                            />
                          ),
                        }))}
                      />
                    ) : (
                      <Typography.Text type="secondary">当前路径下样本量较小，暂无法形成稳定证据。</Typography.Text>
                    )}
                  </Card>

                  <Card title="五、主要拖累 / 驱动路径" size="small">
                    {summary.dragItems.length > 0 ? (
                      <Table rowKey={(row) => `${row.primaryDimension}-${row.primaryValue}-${row.secondaryPath}`} size="small" columns={dragColumns} dataSource={summary.dragItems} pagination={false} scroll={{ x: 1300 }} />
                    ) : (
                      <Typography.Text type="secondary">当前暂无明显拖累项。</Typography.Text>
                    )}
                  </Card>

                  <Card title="六、建议动作" size="small">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {summary.actionItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="七、待进一步确认" size="small">
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {summary.pendingChecks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'markdown',
              label: 'Markdown 文本',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space>
                    <Button onClick={onCopyMarkdown}>复制 Markdown</Button>
                    <Button onClick={onDownloadMarkdown}>下载 Markdown</Button>
                  </Space>
                  <Card size="small">
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontFamily: 'monospace' }}>
                      {summary.markdown}
                    </Typography.Paragraph>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
