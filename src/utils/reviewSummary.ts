import type { DiagnosisResult } from '../types/diagnosis';
import type { ReviewContext, ReviewDragItem, ReviewOverviewItem, ReviewSummaryData } from '../types/reviewSummary';
import { getMetricTrendDirection } from '../config/metricConfig';

const EPSILON = 0.0001;

function formatValue(value: number | null, type: ReviewOverviewItem['type']): string {
  if (value === null || !Number.isFinite(value)) return '暂无上一周期数据';
  if (type === 'currency') return value.toFixed(2);
  if (type === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${Math.round(value)}`;
}

function formatChange(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return '暂无上一周期数据';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${(changePct * 100).toFixed(2)}%`;
}

function statusPriority(item: ReviewOverviewItem): number {
  if (item.status === '变差') return 3;
  if (item.status === '持平') return 2;
  if (item.status === '变好') return 1;
  return 0;
}

function pickPrimaryMetric(overviewItems: ReviewOverviewItem[], selectedMetric: string) {
  const worseItems = overviewItems
    .filter((item) => item.status === '变差' && item.changePct !== null)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  if (worseItems.length > 0) return worseItems[0].metricKey;
  if (overviewItems.some((item) => item.metricKey === selectedMetric)) return selectedMetric;
  return overviewItems[0]?.metricKey ?? selectedMetric;
}

function buildCoreConclusions(overviewItems: ReviewOverviewItem[], diagnosis: DiagnosisResult | null): string[] {
  const sorted = [...overviewItems].sort((a, b) => {
    if (statusPriority(a) !== statusPriority(b)) return statusPriority(b) - statusPriority(a);
    return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
  });

  const lines = sorted.slice(0, 4).map((item) => {
    if (item.changePct === null) return `「${item.metricKey}」当前为 ${formatValue(item.current, item.type)}，暂无上一周期数据。`;
    const directionText = item.changePct > EPSILON ? '上升' : item.changePct < -EPSILON ? '下降' : '基本持平';
    return `「${item.metricKey}」当前 ${formatValue(item.current, item.type)}，上期 ${formatValue(item.previous, item.type)}，${directionText} ${Math.abs(item.changePct * 100).toFixed(2)}%，状态：${item.status}。`;
  });

  if (diagnosis && diagnosis.dimensionResults.length > 0 && !diagnosis.error) {
    const topGroup = diagnosis.dimensionResults[0];
    const topRow = topGroup.rows[0];
    if (topRow) {
      lines.push(`下钻诊断显示主要影响来自「${topGroup.dimension}=${topRow.dimensionValue}」，变化率 ${formatChange(topRow.changeRate)}。`);
    }
  }

  return lines.slice(0, 5);
}

function buildDragItems(diagnosis: DiagnosisResult | null): ReviewDragItem[] {
  if (!diagnosis || diagnosis.error || diagnosis.dimensionResults.length === 0) return [];

  return diagnosis.dimensionResults.flatMap((group) =>
    group.rows.slice(0, 2).map((row) => ({
      primaryDimension: group.dimension,
      primaryValue: row.dimensionValue,
      currentMetric: row.currentMetric,
      previousMetric: row.previousMetric,
      changeRate: row.changeRate,
      secondaryPath:
        row.secondaryResults && row.secondaryResults.length > 0
          ? `${group.dimension}=${row.dimensionValue} -> ${row.secondaryResults[0].dimension}=${row.secondaryResults[0].rows[0]?.dimensionValue ?? '暂无'}`
          : `${group.dimension}=${row.dimensionValue}`,
      reason: row.reason,
    })),
  ).slice(0, 5);
}

function buildActionItems(overviewItems: ReviewOverviewItem[], diagnosis: DiagnosisResult | null): string[] {
  const actions = new Set<string>();
  const isWorse = (metric: string) => overviewItems.some((item) => item.metricKey === metric && item.status === '变差');

  if (isWorse('当日付费人数')) {
    actions.add('建议优先排查下降最大的渠道、代理、账户命名和广告组。');
    actions.add('检查对应账户是否预算下降、计划暂停、素材衰退、转化回传异常。');
  }
  if (isWorse('当日付费成本') || isWorse('当日连麦成本') || isWorse('3日付费成本')) {
    actions.add('建议排查消耗上升但付费人数未同步增长的维度，优先查看高消耗、高成本广告组。');
    actions.add('检查出价、预算、素材点击率、直播间承接。');
  }
  if (isWorse('当日付费ROI') || isWorse('3日付费ROI')) {
    actions.add('建议排查付费金额下降但消耗未下降的渠道或账户，优先关注高消耗低回收广告组。');
    actions.add('检查付费转化、客单价、咨询师承接。');
  }
  if (isWorse('3日付费率')) {
    actions.add('建议检查漏斗链路：落地页加载、直播间入口、咨询师在线率与排队时长。');
  }

  diagnosis?.suggestions?.forEach((item) => actions.add(item));

  if (actions.size === 0) {
    actions.add('当前指标整体稳定，建议持续观察重点渠道与广告组，并进行小步测试。');
  }

  return Array.from(actions).slice(0, 6);
}

function buildPendingChecks(): string[] {
  return [
    '是否存在预算调整或账户暂停？',
    '是否更换了素材或投放计划？',
    '是否有转化回传异常？',
    '是否有咨询师在线率或直播间承接变化？',
    '是否有渠道流量结构变化？',
  ];
}

function buildMarkdown(data: Omit<ReviewSummaryData, 'markdown'>): string {
  const { context, overviewItems, coreConclusions, dragItems, actionItems, pendingChecks } = data;
  const rangeText = context.dateRange ? `${context.dateRange[0]} 至 ${context.dateRange[1]}` : '全部日期';

  const overviewRows = overviewItems
    .map((item) => `| ${item.metricKey} | ${formatValue(item.current, item.type)} | ${formatValue(item.previous, item.type)} | ${formatChange(item.changePct)} | ${item.status} |`)
    .join('\n');

  const dragText = dragItems.length
    ? dragItems
      .map(
        (item) =>
          `- ${item.primaryDimension}=${item.primaryValue}：当前 ${item.currentMetric === null ? '暂无' : item.currentMetric.toFixed(2)}，上一周期 ${item.previousMetric === null ? '暂无' : item.previousMetric.toFixed(2)}，变化 ${formatChange(item.changeRate)}；二级路径 ${item.secondaryPath}；判断原因：${item.reason}`,
      )
      .join('\n')
    : '当前暂无明显拖累项。';

  return [
    '# 投放数据复盘摘要',
    '',
    '## 一、基础信息',
    `- 数据周期：${rangeText}`,
    `- 当前分析场景：${context.scenario}`,
    `- 拆分维度：${context.splitDimension}`,
    `- 当前指标：${context.selectedMetric}`,
    `- 当前高级筛选条件：${context.globalFilterSummary}`,
    `- 当前 T0 概览筛选条件：${context.t0OverviewFilterSummary}`,
    `- 数据行数：${context.dataRowCount}`,
    `- 当前 Sheet 名称：${context.sheetName}`,
    '',
    '## 二、T0 核心指标概览',
    '',
    '| 指标 | 当前周期 | 上一周期 | 环比 | 状态 |',
    '|---|---:|---:|---:|---|',
    overviewRows,
    '',
    '## 三、核心结论',
    ...coreConclusions.map((line, index) => `${index + 1}. ${line}`),
    '',
    '## 四、主要拖累项',
    dragText,
    '',
    '## 五、建议动作',
    ...actionItems.map((line, index) => `${index + 1}. ${line}`),
    '',
    '## 六、待进一步确认',
    ...pendingChecks.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n');
}

export function generateReviewSummary(params: {
  context: ReviewContext;
  overviewItems: ReviewOverviewItem[];
  diagnosisResult: DiagnosisResult | null;
  selectedMetric: string;
}): ReviewSummaryData {
  const { context, overviewItems, diagnosisResult, selectedMetric } = params;

  const primaryMetric = pickPrimaryMetric(overviewItems, selectedMetric);
  const fallbackSummary = diagnosisResult && diagnosisResult.summary.metricKey === primaryMetric
    ? diagnosisResult
    : diagnosisResult;

  const coreConclusions = buildCoreConclusions(overviewItems, fallbackSummary);
  const dragItems = buildDragItems(fallbackSummary);
  const actionItems = buildActionItems(overviewItems, fallbackSummary);
  const pendingChecks = buildPendingChecks();

  const baseData = { context, overviewItems, coreConclusions, dragItems, actionItems, pendingChecks };

  return {
    ...baseData,
    markdown: buildMarkdown(baseData),
  };
}

export function getOverviewStatus(metricKey: string, changePct: number | null): string {
  if (changePct === null) return '持平';
  if (Math.abs(changePct) <= EPSILON) return '持平';

  const direction = getMetricTrendDirection(metricKey);
  if (direction === 'higher_better') return changePct > 0 ? '变好' : '变差';
  if (direction === 'lower_better') return changePct < 0 ? '变好' : '变差';
  return changePct > 0 ? '上升' : '下降';
}

export function buildMarkdownFileName(dateRange: [string, string] | null): string {
  if (!dateRange) return 'ad-bi-review-all.md';
  return `ad-bi-review-${dateRange[0]}-to-${dateRange[1]}.md`;
}
