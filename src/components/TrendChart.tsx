import ReactECharts from 'echarts-for-react';
import type { MetricType } from '../config/metricConfig';
import { formatMetricValue } from '../utils/aggregation';

interface TrendPoint {
  日期: string;
  拆分维度: string;
  指标值: number | null;
}

interface TrendChartProps {
  rows: TrendPoint[];
  dates: string[];
  series: string[];
  splitDimensionLabel: string;
  metricLabel: string;
  metricType: MetricType;
}

export default function TrendChart({ rows, dates, series, splitDimensionLabel, metricLabel, metricType }: TrendChartProps) {
  const pointMap = new Map(rows.map((row) => [`${row.日期}__${row.拆分维度}`, row.指标值]));

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; seriesName: string; data: number | null }>) => {
        const date = params[0]?.axisValue ?? '-';
        const lines = params
          .map((item) => `${splitDimensionLabel}：${item.seriesName}<br/>${metricLabel}：${formatMetricValue(item.data, metricType)}`)
          .join('<br/>');
        return `日期：${date}<br/>${lines}`;
      },
    },
    legend: { data: series },
    xAxis: {
      type: 'category',
      data: dates,
      name: '日期',
    },
    yAxis: { type: 'value', name: metricLabel },
    series: series.map((splitValue) => ({
      name: splitValue,
      type: 'line',
      smooth: true,
      data: dates.map((date) => pointMap.get(`${date}__${splitValue}`) ?? null),
      connectNulls: false,
    })),
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
