import { useMemo, useState } from 'react';
import { Card, Collapse, Input, Space, Tag, Typography } from 'antd';
import type { DimensionField, MetricField } from '../types';

interface FieldPanelProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
}

export default function FieldPanel({ dimensions, metrics }: FieldPanelProps) {
  const [metricKeyword, setMetricKeyword] = useState('');

  const t0Metrics = useMemo(() => metrics.filter((item) => item.tag === 'T0'), [metrics]);
  const t1Metrics = useMemo(() => metrics.filter((item) => item.tag === 'T1'), [metrics]);

  const filteredT1Metrics = useMemo(() => {
    const keyword = metricKeyword.trim().toLowerCase();
    if (!keyword) {
      return t1Metrics;
    }

    return t1Metrics.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [metricKeyword, t1Metrics]);

  return (
    <Card title="字段面板" bordered={false} style={{ height: '100%' }}>
      <Collapse
        bordered={false}
        defaultActiveKey={['dimensions', 't0']}
        items={[
          {
            key: 'dimensions',
            label: `维度字段（${dimensions.length}）`,
            children: (
              <Space wrap>
                {dimensions.map((item) => (
                  <Tag key={item.key} color="blue">
                    {item.name}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            key: 't0',
            label: `T0 核心指标（${t0Metrics.length}）`,
            children: (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {t0Metrics.map((item) => (
                  <Space key={item.key} size={8}>
                    <Tag>{item.name}</Tag>
                    <Tag color="blue">T0</Tag>
                  </Space>
                ))}
              </Space>
            ),
          },
          {
            key: 't1',
            label: `T1 更多指标（${t1Metrics.length}）`,
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Input
                  allowClear
                  value={metricKeyword}
                  placeholder="搜索 T1 指标"
                  onChange={(event) => setMetricKeyword(event.target.value)}
                />
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {filteredT1Metrics.length > 0 ? (
                    filteredT1Metrics.map((item) => (
                      <Space key={item.key} size={8}>
                        <Tag>{item.name}</Tag>
                        <Tag color="default">T1</Tag>
                      </Space>
                    ))
                  ) : (
                    <Typography.Text type="secondary">未匹配到指标</Typography.Text>
                  )}
                </Space>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
