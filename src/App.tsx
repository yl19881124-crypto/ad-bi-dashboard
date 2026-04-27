import { useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Layout, message, Space, Tag, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import ConfigBar from './components/ConfigBar';
import DataTable from './components/DataTable';
import FieldPanel from './components/FieldPanel';
import TrendChart from './components/TrendChart';
import { dimensionFields as mockDimensions, metricFields as mockMetrics, mockRows, mockSummary } from './mock/data';
import type { DataRow, DimensionField, MetricField, ParseSummary } from './types';
import { parseWorkbookFile } from './utils/excel';

const { Header, Sider, Content } = Layout;

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(mockRows);
  const [dimensions, setDimensions] = useState<DimensionField[]>(mockDimensions);
  const [metrics, setMetrics] = useState<MetricField[]>(mockMetrics);
  const [summary, setSummary] = useState<ParseSummary>(mockSummary);
  const [activeDateField, setActiveDateField] = useState<string>('日期');
  const [sheetTip, setSheetTip] = useState<string>('当前展示 mock 数据。');

  const previewRows = rows.slice(0, 20);
  const defaultDimension = dimensions.find((item: DimensionField) => item.key === '版位')?.key ?? dimensions[0]?.key;
  const defaultMetric = metrics.find((item: MetricField) => item.key === '当日付费人数')?.key ?? metrics[0]?.key;
  const chartXField = dimensions.find((item: DimensionField) => item.key === activeDateField)?.key ?? dimensions[0]?.key;

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls,.csv',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const parsed = await parseWorkbookFile(file as File);

          setRows(parsed.rows);
          setDimensions(parsed.dimensions);
          setMetrics(parsed.metrics);
          setSummary(parsed.summary);
          setActiveDateField(parsed.dateFields[0] ?? parsed.dimensions[0]?.key ?? '');

          if (parsed.summary.fallbackToFirstSheet) {
            const tip = `未找到「分账户底表」，已读取首个 sheet：${parsed.summary.sheetName}`;
            setSheetTip(tip);
            message.warning(tip);
          } else {
            const tip = `已读取 sheet：${parsed.summary.sheetName}`;
            setSheetTip(tip);
            message.success(`${tip}，共 ${parsed.summary.totalRows} 行`);
          }
        } catch (error) {
          message.error('Excel / CSV 解析失败，请检查文件格式。');
        }

        return false;
      },
    }),
    [],
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
        <FieldPanel dimensions={dimensions} metrics={metrics} />
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
            <Alert message={sheetTip} type="info" showIcon />

            <ConfigBar
              dimensions={dimensions}
              metrics={metrics}
              defaultDimension={defaultDimension}
              defaultMetric={defaultMetric}
            />

            <Card title="上传结果概览" bordered={false}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="总行数">{summary.totalRows}</Descriptions.Item>
                <Descriptions.Item label="总字段数">{summary.totalFields}</Descriptions.Item>
                <Descriptions.Item label="识别维度字段">
                  <Space wrap>
                    {dimensions.map((item: DimensionField) => (
                      <Tag key={item.key} color="blue">
                        {item.name}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="识别指标字段">
                  <Space wrap>
                    {metrics.map((item: MetricField) => (
                      <Tag key={item.key} color="purple">
                        {item.name}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="趋势图（默认：折线图 / 默认X轴：日期 / 默认拆分维度：版位 / 默认指标：当日付费人数）" bordered={false}>
              <TrendChart rows={rows} xField={chartXField} metricField={defaultMetric} />
            </Card>

            <Card title="前 20 行数据预览" bordered={false}>
              <DataTable rows={previewRows} />
            </Card>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
}
