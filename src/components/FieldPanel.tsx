import { Card, Empty, Space, Tag, Typography } from 'antd';
import type { DimensionField, MetricField } from '../types';

interface FieldPanelProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
}

export default function FieldPanel({ dimensions, metrics }: FieldPanelProps) {
  return (
    <Card title="字段面板" bordered={false} style={{ height: '100%' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <section>
          <Typography.Title level={5}>维度字段</Typography.Title>
          {dimensions.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无维度字段" />
          ) : (
            <Space wrap>
              {dimensions.map((item) => (
                <Tag key={item.key} color="blue">
                  {item.name}
                </Tag>
              ))}
            </Space>
          )}
        </section>

        <section>
          <Typography.Title level={5}>指标字段</Typography.Title>
          {metrics.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无指标字段" />
          ) : (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {metrics.map((item) => (
                <Space key={item.key}>
                  <Tag color="purple">{item.name}</Tag>
                  <Tag color={item.tag === 'T0' ? 'green' : 'gold'}>{item.tag}</Tag>
                </Space>
              ))}
            </Space>
          )}
        </section>
      </Space>
    </Card>
  );
}
