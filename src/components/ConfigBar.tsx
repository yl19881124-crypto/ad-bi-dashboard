import { Button, Card, DatePicker, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import type { DimensionField, MetricField } from '../types';
import type { FilterSelections } from '../utils/aggregation';

const { RangePicker } = DatePicker;

interface AnalysisScenario {
  key: string;
  name: string;
}

interface ConfigBarProps {
  dimensions: DimensionField[];
  metrics: MetricField[];
  scenarios: AnalysisScenario[];
  selectedScenario: string;
  selectedDimension: string;
  selectedMetric: string;
  selectedDateRange: [string, string] | null;
  filterOptions: Record<string, string[]>;
  selectedFilters: FilterSelections;
  onScenarioChange: (value: string) => void;
  onDimensionChange: (value: string) => void;
  onMetricChange: (value: string) => void;
  onDateRangeChange: (value: [string, string] | null) => void;
  onFilterChange: (field: string, values: string[]) => void;
  onClearFilters: () => void;
}

const defaultRange: [string, string] = ['2026-04-20', '2026-04-26'];

export default function ConfigBar(props: ConfigBarProps) {
  const {
    dimensions,
    metrics,
    scenarios,
    selectedScenario,
    selectedDimension,
    selectedMetric,
    selectedDateRange,
    filterOptions,
    selectedFilters,
    onScenarioChange,
    onDimensionChange,
    onMetricChange,
    onDateRangeChange,
    onFilterChange,
    onClearFilters,
  } = props;
  const [expandAdvanced, setExpandAdvanced] = useState(false);

  const filterTags = useMemo(
    () =>
      Object.entries(selectedFilters).flatMap(([field, values]) =>
        values.map((value) => ({ key: `${field}-${value}`, label: `${field}：${value}` })),
      ),
    [selectedFilters],
  );

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
          value={selectedScenario}
          style={{ width: 200 }}
          options={scenarios.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="分析场景"
          onChange={onScenarioChange}
        />
        <Select
          value={selectedDimension}
          style={{ width: 160 }}
          options={dimensions.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="拆分维度"
          onChange={onDimensionChange}
        />
        <Select
          value={selectedMetric}
          style={{ width: 240 }}
          options={metrics.map((item) => ({ value: item.key, label: item.name }))}
          placeholder="指标"
          onChange={onMetricChange}
        />
        <Button onClick={() => setExpandAdvanced((v) => !v)}>{expandAdvanced ? '收起高级筛选' : '高级筛选'}</Button>
      </Space>

      {expandAdvanced && (
        <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 12 }}>
          <Space wrap>
            {Object.entries(filterOptions).map(([field, options]) => (
              <Select
                key={field}
                mode="multiple"
                showSearch
                allowClear
                maxTagCount="responsive"
                placeholder={`筛选${field}`}
                style={{ minWidth: 220 }}
                options={options.map((value) => ({ label: value, value }))}
                value={selectedFilters[field] ?? []}
                onChange={(values) => onFilterChange(field, values)}
              />
            ))}
            <Button onClick={onClearFilters}>清空筛选</Button>
          </Space>
          {filterTags.length > 0 && (
            <Space wrap>
              <Typography.Text type="secondary">已选筛选：</Typography.Text>
              {filterTags.map((item) => (
                <Tag key={item.key}>{item.label}</Tag>
              ))}
            </Space>
          )}
        </Space>
      )}
    </Card>
  );
}
