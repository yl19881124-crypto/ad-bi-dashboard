import { Button, Card, Descriptions, Drawer, Empty, Space, Table, Tabs, Tag, Typography } from 'antd';
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

export default function ReviewSummaryDrawer(props: Props) {
  const { open, onClose, hasUploadedData, summary, onCopyMarkdown, onDownloadMarkdown } = props;

  const overviewColumns: ColumnsType<ReviewSummaryData['overviewItems'][number]> = [
    { title: '指标', dataIndex: 'metricKey', key: 'metricKey', width: 150 },
    { title: '当前周期', dataIndex: 'current', key: 'current', render: (value, row) => (row.type === 'percent' ? `${((value ?? 0) * 100).toFixed(2)}%` : value === null ? '-' : row.type === 'currency' ? value.toFixed(2) : Math.round(value)) },
    { title: '上一周期', dataIndex: 'previous', key: 'previous', render: (value, row) => (value === null ? '暂无上一周期数据' : row.type === 'percent' ? `${(value * 100).toFixed(2)}%` : row.type === 'currency' ? value.toFixed(2) : Math.round(value)) },
    { title: '环比', dataIndex: 'changePct', key: 'changePct', render: (value) => (value === null ? '暂无上一周期数据' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`) },
    { title: '状态', dataIndex: 'status', key: 'status', render: (value) => <Tag color={value === '变好' ? 'green' : value === '变差' ? 'red' : 'default'}>{value}</Tag> },
  ];

  const dragColumns: ColumnsType<ReviewSummaryData['dragItems'][number]> = [
    { title: '一级拖累维度', dataIndex: 'primaryDimension', key: 'primaryDimension' },
    { title: '一级维度值', dataIndex: 'primaryValue', key: 'primaryValue' },
    { title: '当前周期值', dataIndex: 'currentMetric', key: 'currentMetric', render: (value) => (value === null ? '-' : value.toFixed(2)) },
    { title: '上一周期值', dataIndex: 'previousMetric', key: 'previousMetric', render: (value) => (value === null ? '-' : value.toFixed(2)) },
    { title: '变化率', dataIndex: 'changeRate', key: 'changeRate', render: (value) => (value === null ? '暂无上一周期数据' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`) },
    { title: '二级下钻路径', dataIndex: 'secondaryPath', key: 'secondaryPath', width: 260 },
    { title: '判断原因', dataIndex: 'reason', key: 'reason', width: 320 },
  ];

  return (
    <Drawer title="投放数据复盘摘要" width={1080} open={open} onClose={onClose} destroyOnClose styles={{ body: { overflowY: 'auto' } }}>
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

                  <Card title="四、主要拖累项" size="small">
                    {summary.dragItems.length > 0 ? (
                      <Table rowKey={(row) => `${row.primaryDimension}-${row.primaryValue}-${row.secondaryPath}`} size="small" columns={dragColumns} dataSource={summary.dragItems} pagination={false} scroll={{ x: 1300 }} />
                    ) : (
                      <Typography.Text type="secondary">当前暂无明显拖累项。</Typography.Text>
                    )}
                  </Card>

                  <Card title="五、建议动作" size="small">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {summary.actionItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="六、待进一步确认" size="small">
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
