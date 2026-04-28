import type { MetricType, MetricTrendDirection } from '../config/metricConfig';

export interface DiagnosisSummary {
  metricKey: string;
  metricType: MetricType;
  metricMode: 'source' | 'daily_average_source' | 'formula' | 'unknown';
  numeratorField: string;
  denominatorField: string | null;
  currentValue: number | null;
  previousValue: number | null;
  changeValue: number | null;
  changeRate: number | null;
  status: '变好' | '变差' | '持平' | '上升' | '下降';
  direction: MetricTrendDirection | null;
}

export interface DiagnosisDimensionRow {
  key: string;
  dimensionValue: string;
  currentMetric: number | null;
  previousMetric: number | null;
  changeRate: number | null;
  numeratorCurrent: number;
  numeratorPrevious: number;
  denominatorCurrent: number;
  denominatorPrevious: number;
  contribution: number | null;
  reason: string;
  action: string;
  sampleWarning: boolean;
  impactScore: number;
  secondaryResults?: DiagnosisSecondaryDimensionResult[];
}

export interface DiagnosisDimensionResult {
  dimension: string;
  rows: DiagnosisDimensionRow[];
}

export interface DiagnosisSecondaryRow {
  key: string;
  dimensionValue: string;
  currentMetric: number | null;
  previousMetric: number | null;
  changeRate: number | null;
  numeratorCurrent: number;
  numeratorPrevious: number;
  denominatorCurrent: number;
  denominatorPrevious: number;
  contribution: number | null;
  reason: string;
  sampleWarning: boolean;
  impactScore: number;
}

export interface DiagnosisSecondaryDimensionResult {
  dimension: string;
  rows: DiagnosisSecondaryRow[];
}

export interface DiagnosisResult {
  currentRange: [string, string];
  previousRange: [string, string];
  summary: DiagnosisSummary;
  conclusion: string;
  conclusionLines: string[];
  dimensionResults: DiagnosisDimensionResult[];
  suggestions: string[];
  error?: string;
}
