import { Card, DatePicker, Input, Select, Space } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { DimensionField, MetricField } from '../types';

const { RangePicker } = DatePicker;

interface ConfigBarProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
  selectedDimension: string;
  selectedMetric: string;
  selectedDateRange: [string, string] | null;
  onDimensionChange: (value: string) => void;
  onMetricChange: (value: string) => void;
  onDateRangeChange: (value: [string, string] | null) => void;
}

const defaultRange: [string, string] = ['2026-04-20', '2026-04-26'];

export default function ConfigBar({
  dimensions,
  metrics,
  selectedDimension,
  selectedMetric,
  selectedDateRange,
  onDimensionChange,
  onMetricChange,
  onDateRangeChange,
}: ConfigBarProps) {
  return (
    <Card bordered={false}>
      <Space wrap size="middle">
        <RangePicker
          value={(selectedDateRange ?? defaultRange).map((dateText) => dayjs(dateText, 'YYYY-MM-DD')) as [Dayjs, Dayjs]}
          onChange={(value) => {
            if (!value || !value[0] || !value[1]) {
              onDateRangeChange(null);
              return;
            }
            onDateRangeChange([value[0].format('YYYY-MM-DD'), value[1].format('YYYY-MM-DD')]);
          }}
        />
        <Select
          value={selectedDimension}
          style={{ width: 160 }}
          options={dimensions.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="维度选择"
          onChange={onDimensionChange}
        />
        <Select
          value={selectedMetric}
          style={{ width: 260 }}
          options={metrics.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="指标选择"
          onChange={onMetricChange}
        />
        <Input placeholder="筛选条件（示例：渠道=抖音）" style={{ width: 240 }} disabled />
      </Space>
    </Card>
  );
}
