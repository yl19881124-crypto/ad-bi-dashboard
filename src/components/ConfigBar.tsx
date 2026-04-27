import { Card, DatePicker, Select, Space, Input } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { DimensionField, MetricField } from '../types';

const { RangePicker } = DatePicker;

interface ConfigBarProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
}

const defaultRange: [Dayjs, Dayjs] = [dayjs('2026-04-20'), dayjs('2026-04-26')];

export default function ConfigBar({ dimensions, metrics }: ConfigBarProps) {
  return (
    <Card bordered={false}>
      <Space wrap size="middle">
        <RangePicker defaultValue={defaultRange} />
        <Select
          defaultValue="版位"
          style={{ width: 160 }}
          options={dimensions.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="维度选择"
        />
        <Select
          mode="multiple"
          defaultValue={['当日付费人数']}
          style={{ width: 260 }}
          options={metrics.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="指标选择"
        />
        <Input placeholder="筛选条件（示例：渠道=抖音）" style={{ width: 240 }} />
      </Space>
    </Card>
  );
}
