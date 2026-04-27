import { Card, Space, Tag, Typography } from 'antd';
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
          <Space wrap>
            {dimensions.map((item) => (
              <Space key={item.key} size={4}>
                <Tag color="blue">{item.name}</Tag>
                {item.isDate ? <Tag color="cyan">日期</Tag> : null}
              </Space>
            ))}
          </Space>
        </section>

        <section>
          <Typography.Title level={5}>指标字段</Typography.Title>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {metrics.map((item) => (
              <Space key={item.key}>
                <Tag color="purple">{item.name}</Tag>
                <Tag color={item.tag === 'T0' ? 'green' : 'gold'}>{item.tag}</Tag>
              </Space>
            ))}
          </Space>
        </section>
      </Space>
    </Card>
  );
}
