import ReactECharts from 'echarts-for-react';
import type { DataRow } from '../types';

interface TrendChartProps {
  rows: DataRow[];
  xField?: string;
  metricField?: string;
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function TrendChart({ rows, xField, metricField }: TrendChartProps) {
  const xAxisData = rows.map((row) => String(row[xField ?? ''] ?? ''));
  const seriesData = rows.map((row) => toNumber(row[metricField ?? '']));

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: [metricField ?? '指标'] },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: xField ?? 'X轴',
    },
    yAxis: { type: 'value', name: metricField ?? '数值' },
    series: [
      {
        name: metricField ?? '指标',
        type: 'line',
        smooth: true,
        data: seriesData,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
