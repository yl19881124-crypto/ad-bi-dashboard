import type { MetricType } from '../config/metricConfig';

export interface ReviewContext {
  dateRange: [string, string] | null;
  scenario: string;
  splitDimension: string;
  selectedMetric: string;
  globalFilterSummary: string;
  t0OverviewFilterSummary: string;
  dataRowCount: number;
  sheetName: string;
}

export interface ReviewOverviewItem {
  key: string;
  metricKey: string;
  type: MetricType;
  current: number | null;
  previous: number | null;
  changePct: number | null;
  status: string;
}

export interface ReviewDragItem {
  primaryDimension: string;
  primaryValue: string;
  currentMetric: number | null;
  previousMetric: number | null;
  changeRate: number | null;
  secondaryPath: string;
  reason: string;
}

export interface ReviewEvidenceRow {
  key: string;
  dimensionValue: string;
  currentValue: number | null;
  previousValue: number | null;
  changeValue: number | null;
  changeRate: number | null;
  contribution: number | null;
  reason: string;
  numeratorCurrent: number;
  numeratorPrevious: number;
  denominatorCurrent: number;
  denominatorPrevious: number;
}

export interface ReviewEvidenceSection {
  dimension: string;
  rows: ReviewEvidenceRow[];
}

export interface ReviewSummaryData {
  context: ReviewContext;
  overviewItems: ReviewOverviewItem[];
  coreConclusions: string[];
  evidenceSections: ReviewEvidenceSection[];
  evidenceTextLines: string[];
  dragItems: ReviewDragItem[];
  actionItems: string[];
  pendingChecks: string[];
  markdown: string;
}
