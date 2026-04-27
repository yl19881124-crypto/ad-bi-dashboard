import { useMemo, useState } from 'react';
import { Button, Card, Layout, message, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ConfigBar from './components/ConfigBar';
import DataTable from './components/DataTable';
import FieldPanel from './components/FieldPanel';
import TrendChart from './components/TrendChart';
import { dimensionFields, metricFields, mockRows } from './mock/data';

const { Header, Sider, Content } = Layout;

export default function App() {
  const [rows, setRows] = useState(mockRows);

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: '.xlsx,.xls',
      showUploadList: false,
      beforeUpload: async (file: RcFile) => {
        try {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = '分账户底表';

          if (!workbook.SheetNames.includes(sheetName)) {
            message.warning(`未找到 sheet：${sheetName}，当前仅作为框架演示，继续使用 mock 数据。`);
            return false;
          }

          const worksheet = workbook.Sheets[sheetName];
          const parsed = XLSX.utils.sheet_to_json<Record<string, string | number>>(worksheet);

          message.success(`读取成功：${file.name}（${parsed.length} 行），第一阶段暂不替换真实计算逻辑。`);
          setRows(mockRows);
        } catch (error) {
          message.error('Excel 解析失败，请检查文件格式。');
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
                上传 Excel
              </Button>
            </Upload>
          </Space>
        </Header>

        <Content style={{ padding: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ConfigBar dimensions={dimensionFields} metrics={metricFields} />

            <Card title="趋势图（默认：折线图 / X轴：日期 / 拆分维度：版位 / 指标：当日付费人数）" bordered={false}>
              <TrendChart rows={rows} />
            </Card>

            <Card title="数据明细" bordered={false}>
              <DataTable rows={rows} />
            </Card>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
}
