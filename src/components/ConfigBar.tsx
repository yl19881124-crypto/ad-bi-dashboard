import { Card, DatePicker, Select, Space, Input } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { DimensionField, MetricField } from '../types';

const { RangePicker } = DatePicker;

interface ConfigBarProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
  defaultDimension?: string;
  defaultMetric?: string;
}

const defaultRange: [Dayjs, Dayjs] = [dayjs('2026-04-20'), dayjs('2026-04-26')];
const phase1DefaultDimension = '版位';
const phase1DefaultMetric = '当日付费人数';

export default function ConfigBar({ dimensions, metrics, defaultDimension, defaultMetric }: ConfigBarProps) {
  return (
    <Card bordered={false}>
      <Space wrap size="middle">
        <RangePicker defaultValue={defaultRange} />
        <Select
          defaultValue={defaultDimension ?? phase1DefaultDimension}
          style={{ width: 160 }}
          options={dimensions.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="维度选择"
        />
        <Select
          mode="multiple"
          defaultValue={[defaultMetric ?? phase1DefaultMetric]}
          style={{ width: 260 }}
          options={metrics.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="指标选择"
        />
        <Input placeholder="筛选条件（示例：渠道=抖音）" style={{ width: 240 }} />
      </Space>
    </Card>
  );
}
