import ReactECharts from 'echarts-for-react';
import type { AdDataRow } from '../types';

interface TrendChartProps {
  rows: AdDataRow[];
}

export default function TrendChart({ rows }: TrendChartProps) {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['当日付费人数'] },
    xAxis: {
      type: 'category',
      data: rows.map((row) => row.日期),
      name: '日期',
    },
    yAxis: { type: 'value', name: '人数' },
    series: [
      {
        name: '当日付费人数',
        type: 'line',
        smooth: true,
        data: rows.map((row) => row.当日付费人数),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
