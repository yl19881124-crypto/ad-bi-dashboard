import type { FieldTag } from '../types';

export type MetricType = 'number' | 'currency' | 'percent';

interface MetricBase {
  key: string;
  name: string;
  tag: FieldTag;
  type: MetricType;
}

interface SourceMetricConfig extends MetricBase {
  mode: 'source';
  sourceField: string;
  aggregation: 'sum';
}

interface FormulaMetricConfig extends MetricBase {
  mode: 'formula';
  numerator: string;
  denominator: string;
}

export type MetricConfig = SourceMetricConfig | FormulaMetricConfig;

export const T0_METRIC_CONFIGS: MetricConfig[] = [
  { key: '当日付费人数', name: '当日付费人数', tag: 'T0', type: 'number', mode: 'source', sourceField: '当日付费人数', aggregation: 'sum' },
  { key: '当日付费ROI', name: '当日付费ROI', tag: 'T0', type: 'percent', mode: 'formula', numerator: '当日付费金额(元)', denominator: '实际消耗(元)' },
  { key: '当日付费成本', name: '当日付费成本', tag: 'T0', type: 'currency', mode: 'formula', numerator: '实际消耗(元)', denominator: '当日付费人数' },
  { key: '3日付费成本', name: '3日付费成本', tag: 'T0', type: 'currency', mode: 'formula', numerator: '实际消耗(元)', denominator: '3日内付费人数' },
  { key: '3日付费ROI', name: '3日付费ROI', tag: 'T0', type: 'percent', mode: 'formula', numerator: '3日内付费金额(元)', denominator: '实际消耗(元)' },
  { key: '3日付费率', name: '3日付费率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '3日内付费人数', denominator: '注册_登录人数' },
  { key: '落地页到达率', name: '落地页到达率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '连麦落地页到达人数', denominator: '注册_登录人数' },
  { key: '登陆➡️直播间进入率', name: '登陆➡️直播间进入率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '进入直播间人数', denominator: '注册_登录人数' },
  { key: '落地页➡️直播间进入率', name: '落地页➡️直播间进入率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '进入直播间人数', denominator: '连麦落地页到达人数' },
  { key: '登陆➡️当日连麦率', name: '登陆➡️当日连麦率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '当日连麦人数', denominator: '注册_登录人数' },
  { key: '直播间➡️当日连麦率', name: '直播间➡️当日连麦率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '当日连麦人数', denominator: '进入直播间人数' },
  { key: '当日连麦➡️付费连麦转化率', name: '当日连麦➡️付费连麦转化率', tag: 'T0', type: 'percent', mode: 'formula', numerator: '首日付费连麦人数', denominator: '当日连麦人数' },
  { key: '当日付费连麦用户占比', name: '当日付费连麦用户占比', tag: 'T0', type: 'percent', mode: 'formula', numerator: '首日付费连麦人数', denominator: '当日付费人数' },
];

export const T0_METRIC_KEYS = new Set(T0_METRIC_CONFIGS.map((metric) => metric.key));

export const metricConfigMap = new Map<string, MetricConfig>(T0_METRIC_CONFIGS.map((metric) => [metric.key, metric]));

export function getMetricType(metricKey: string): MetricType {
  return metricConfigMap.get(metricKey)?.type ?? 'number';
}
