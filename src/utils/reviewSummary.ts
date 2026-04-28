import { metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import type { DiagnosisDimensionRow, DiagnosisResult } from '../types/diagnosis';
import type { ReviewContext, ReviewDragItem, ReviewEvidenceRow, ReviewEvidenceSection, ReviewOverviewItem, ReviewSummaryData } from '../types/reviewSummary';
import { getMetricTrendDirection, getMetricType } from '../config/metricConfig';
import { normalizeExcelDate } from './date';

const EPSILON = 0.0001;
const EVIDENCE_DIMENSIONS = ['账户命名', '广告组名称', '操作系统', '版位', '优化目标', '出价方式', '账户名称', '广告组ID'];
const COST_METRICS = new Set(['当日付费成本', '当日连麦成本', '3日付费成本']);
const ROI_METRICS = new Set(['当日付费ROI', '3日付费ROI']);
const FUNNEL_METRICS = new Set([
  '3日付费率',
  '落地页到达率',
  '登陆➡️直播间进入率',
  '落地页➡️直播间进入率',
  '登陆➡️当日连麦率',
  '直播间➡️当日连麦率',
  '当日连麦➡️付费连麦转化率',
  '当日付费连麦用户占比',
]);

function formatValue(value: number | null, type: ReviewOverviewItem['type']): string {
  if (value === null || !Number.isFinite(value)) return '暂无上一周期数据';
  if (type === 'currency') return value.toFixed(2);
  if (type === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${Math.round(value)}`;
}

function formatGeneralValue(value: number | null, metricKey: string): string {
  const type = getMetricType(metricKey);
  if (value === null || !Number.isFinite(value)) return '暂无数据';
  if (type === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (type === 'currency') return value.toFixed(2);
  return `${Math.round(value)}`;
}

function formatChange(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return '暂无上一周期数据';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${(changePct * 100).toFixed(2)}%`;
}

function formatContribution(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '暂无法计算';
  return `${(value * 100).toFixed(2)}%`;
}

function ratio(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || Math.abs(previous) <= EPSILON) return null;
  return (current - previous) / previous;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
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

function pickPrimaryPath(diagnosis: DiagnosisResult | null): { primary?: { dimension: string; row: DiagnosisDimensionRow }; secondary?: { dimension: string; value: string } } {
  if (!diagnosis || diagnosis.error) return {};
  const primary = diagnosis.dimensionResults
    .flatMap((group) => group.rows.slice(0, 1).map((row) => ({ dimension: group.dimension, row })))
    .sort((a, b) => b.row.impactScore - a.row.impactScore)[0];
  if (!primary) return {};
  const secondary = primary.row.secondaryResults
    ?.flatMap((group) => group.rows.slice(0, 1).map((row) => ({ dimension: group.dimension, value: row.dimensionValue, impactScore: row.impactScore })))
    .sort((a, b) => b.impactScore - a.impactScore)[0];

  return {
    primary,
    secondary: secondary ? { dimension: secondary.dimension, value: secondary.value } : undefined,
  };
}

function buildCoreConclusions(overviewItems: ReviewOverviewItem[], diagnosis: DiagnosisResult | null): string[] {
  if (diagnosis && diagnosis.conclusionLines && diagnosis.conclusionLines.length >= 3 && !diagnosis.error) {
    return diagnosis.conclusionLines.slice(0, 3);
  }

  const sorted = [...overviewItems].sort((a, b) => {
    if (statusPriority(a) !== statusPriority(b)) return statusPriority(b) - statusPriority(a);
    return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
  });

  return sorted.slice(0, 3).map((item) => {
    if (item.changePct === null) return `「${item.metricKey}」当前为 ${formatValue(item.current, item.type)}，暂无上一周期数据。`;
    const directionText = item.changePct > EPSILON ? '上升' : item.changePct < -EPSILON ? '下降' : '基本持平';
    return `「${item.metricKey}」当前 ${formatValue(item.current, item.type)}，上期 ${formatValue(item.previous, item.type)}，${directionText} ${Math.abs(item.changePct * 100).toFixed(2)}%，状态：${item.status}。`;
  });
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

function buildEvidenceReason(metricKey: string, row: ReviewEvidenceRow): string {
  if (COST_METRICS.has(metricKey)) {
    const spendRate = ratio(row.numeratorCurrent, row.numeratorPrevious);
    const countRate = ratio(row.denominatorCurrent, row.denominatorPrevious);
    return `消耗 ${spendRate === null ? '暂无可比' : `${(spendRate * 100).toFixed(2)}%`}，人数 ${countRate === null ? '暂无可比' : `${(countRate * 100).toFixed(2)}%`}`;
  }
  if (ROI_METRICS.has(metricKey)) {
    const revenueRate = ratio(row.numeratorCurrent, row.numeratorPrevious);
    const spendRate = ratio(row.denominatorCurrent, row.denominatorPrevious);
    return `付费金额 ${revenueRate === null ? '暂无可比' : `${(revenueRate * 100).toFixed(2)}%`}，消耗 ${spendRate === null ? '暂无可比' : `${(spendRate * 100).toFixed(2)}%`}`;
  }
  if (FUNNEL_METRICS.has(metricKey)) {
    const numeratorRate = ratio(row.numeratorCurrent, row.numeratorPrevious);
    const denominatorRate = ratio(row.denominatorCurrent, row.denominatorPrevious);
    return `分子 ${numeratorRate === null ? '暂无可比' : `${(numeratorRate * 100).toFixed(2)}%`}，分母 ${denominatorRate === null ? '暂无可比' : `${(denominatorRate * 100).toFixed(2)}%`}`;
  }
  return `变化值 ${formatGeneralValue(row.changeValue, metricKey)}，贡献 ${formatContribution(row.contribution)}`;
}

export function findEvidenceForReviewSummary(params: {
  rows: DataRow[];
  metricKey: string;
  diagnosisResult: DiagnosisResult | null;
  currentRange: [string, string] | null;
}): {
  keyPathFilters: { dimension: string; value: string }[];
  evidenceSections: ReviewEvidenceSection[];
  evidenceTextLines: string[];
  keyPathText: string;
  hasStableEvidence: boolean;
} {
  const { rows, metricKey, diagnosisResult, currentRange } = params;
  if (!currentRange || !diagnosisResult || diagnosisResult.error) {
    return {
      keyPathFilters: [],
      evidenceSections: [],
      evidenceTextLines: ['当前路径下样本量较小，暂无法形成稳定证据，建议扩大日期范围或减少筛选条件后再分析。'],
      keyPathText: '暂无',
      hasStableEvidence: false,
    };
  }

  const { primary, secondary } = pickPrimaryPath(diagnosisResult);
  const keyPathFilters = [
    primary ? { dimension: primary.dimension, value: primary.row.dimensionValue } : null,
    secondary ? { dimension: secondary.dimension, value: secondary.value } : null,
  ].filter(Boolean) as { dimension: string; value: string }[];

  const keyPathText = keyPathFilters.length
    ? keyPathFilters.map((item) => `${item.dimension}=${item.value}`).join(' + ')
    : '暂无明确关键路径';

  const previousRange = diagnosisResult.previousRange;
  const metricConfig = metricConfigMap.get(metricKey);
  const numeratorField = metricConfig?.mode === 'formula' ? metricConfig.numerator : metricKey;
  const denominatorField = metricConfig?.mode === 'formula' ? metricConfig.denominator : '__ROW_COUNT__';

  type PeriodRow = DataRow & { __date: string };
  const periodRows = rows
    .map((row) => ({ ...row, __date: normalizeExcelDate(row.日期) }))
    .filter((row): row is PeriodRow => Boolean(row.__date));

  const scopedRows = periodRows.filter((row) => keyPathFilters.every(({ dimension, value }) => {
    const normalized = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]).trim();
    return normalized === value;
  }));

  const currentRows = scopedRows.filter((row) => row.__date >= currentRange[0] && row.__date <= currentRange[1]);
  const previousRows = scopedRows.filter((row) => row.__date >= previousRange[0] && row.__date <= previousRange[1]);

  if (!currentRows.length || !previousRows.length) {
    return {
      keyPathFilters,
      evidenceSections: [],
      evidenceTextLines: ['当前路径下样本量较小，暂无法形成稳定证据，建议扩大日期范围或减少筛选条件后再分析。'],
      keyPathText,
      hasStableEvidence: false,
    };
  }

  const availableDimensions = EVIDENCE_DIMENSIONS.filter((dimension) => periodRows.some((row) => row[dimension] !== undefined));

  const evidenceSections: ReviewEvidenceSection[] = availableDimensions.map((dimension) => {
    const grouped = new Map<string, { nc: number; np: number; dc: number; dp: number }>();

    const addRow = (row: PeriodRow, isCurrent: boolean) => {
      const value = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]).trim();
      if (!grouped.has(value)) grouped.set(value, { nc: 0, np: 0, dc: 0, dp: 0 });
      const item = grouped.get(value)!;
      if (isCurrent) {
        item.nc += toNumber(row[numeratorField]);
        item.dc += metricConfig?.mode === 'formula' ? toNumber(row[denominatorField]) : 1;
      } else {
        item.np += toNumber(row[numeratorField]);
        item.dp += metricConfig?.mode === 'formula' ? toNumber(row[denominatorField]) : 1;
      }
    };

    currentRows.forEach((row) => addRow(row, true));
    previousRows.forEach((row) => addRow(row, false));

    const allRows: ReviewEvidenceRow[] = Array.from(grouped.entries()).map(([dimensionValue, item]) => {
      const currentValue = metricConfig?.mode === 'formula' ? (item.dc > EPSILON ? item.nc / item.dc : null) : item.nc;
      const previousValue = metricConfig?.mode === 'formula' ? (item.dp > EPSILON ? item.np / item.dp : null) : item.np;
      const changeValue = currentValue !== null && previousValue !== null ? currentValue - previousValue : null;
      const changeRate = currentValue !== null && previousValue !== null && Math.abs(previousValue) > EPSILON ? (currentValue - previousValue) / previousValue : null;

      return {
        key: `${dimension}-${dimensionValue}`,
        dimensionValue,
        currentValue,
        previousValue,
        changeValue,
        changeRate,
        contribution: null,
        reason: '',
        numeratorCurrent: item.nc,
        numeratorPrevious: item.np,
        denominatorCurrent: item.dc,
        denominatorPrevious: item.dp,
      };
    });

    const totalDelta = allRows.reduce((sum, row) => sum + (row.changeValue ?? 0), 0);
    const sameDirectionSum = allRows
      .filter((row) => (row.changeValue ?? 0) !== 0 && Math.sign(row.changeValue ?? 0) === Math.sign(totalDelta))
      .reduce((sum, row) => sum + Math.abs(row.changeValue ?? 0), 0);

    const withContribution = allRows.map((row) => {
      const contribution =
        !row.changeValue || Math.abs(sameDirectionSum) <= EPSILON || Math.sign(row.changeValue) !== Math.sign(totalDelta)
          ? null
          : Math.abs(row.changeValue) / sameDirectionSum;
      const result: ReviewEvidenceRow = {
        ...row,
        contribution,
        reason: buildEvidenceReason(metricKey, { ...row, contribution }),
      };
      return result;
    });

    const sorted = withContribution
      .sort((a, b) => {
        const aImpact = Math.abs(a.changeValue ?? 0);
        const bImpact = Math.abs(b.changeValue ?? 0);
        return bImpact - aImpact;
      })
      .slice(0, 5);

    return { dimension, rows: sorted };
  }).filter((section) => section.rows.length > 0);

  const evidenceTextLines = evidenceSections.slice(0, 4).map((section, index) => {
    const top = section.rows[0];
    if (!top) return `${index + 1}. ${section.dimension}维度暂无稳定变化项。`;

    if (COST_METRICS.has(metricKey)) {
      return `${index + 1}. 在「${keyPathText}」下，${section.dimension}「${top.dimensionValue}」${metricKey}由 ${formatGeneralValue(top.previousValue, metricKey)} 变为 ${formatGeneralValue(top.currentValue, metricKey)}；实际消耗由 ${top.numeratorPrevious.toFixed(2)} 变为 ${top.numeratorCurrent.toFixed(2)}，人数由 ${Math.round(top.denominatorPrevious)} 变为 ${Math.round(top.denominatorCurrent)}。`;
    }

    if (ROI_METRICS.has(metricKey)) {
      return `${index + 1}. 在「${keyPathText}」下，${section.dimension}「${top.dimensionValue}」${metricKey}由 ${formatGeneralValue(top.previousValue, metricKey)} 变为 ${formatGeneralValue(top.currentValue, metricKey)}；付费金额由 ${top.numeratorPrevious.toFixed(2)} 变为 ${top.numeratorCurrent.toFixed(2)}，消耗由 ${top.denominatorPrevious.toFixed(2)} 变为 ${top.denominatorCurrent.toFixed(2)}。`;
    }

    if (FUNNEL_METRICS.has(metricKey)) {
      return `${index + 1}. 在「${keyPathText}」下，${section.dimension}「${top.dimensionValue}」${metricKey}由 ${formatGeneralValue(top.previousValue, metricKey)} 变为 ${formatGeneralValue(top.currentValue, metricKey)}；分子由 ${Math.round(top.numeratorPrevious)} 变为 ${Math.round(top.numeratorCurrent)}，分母由 ${Math.round(top.denominatorPrevious)} 变为 ${Math.round(top.denominatorCurrent)}。`;
    }

    return `${index + 1}. 在「${keyPathText}」下，${section.dimension}「${top.dimensionValue}」${metricKey}由 ${formatGeneralValue(top.previousValue, metricKey)} 变为 ${formatGeneralValue(top.currentValue, metricKey)}，变化 ${formatGeneralValue(top.changeValue, metricKey)}，贡献 ${formatContribution(top.contribution)}。`;
  });

  if (evidenceTextLines.length === 0) {
    return {
      keyPathFilters,
      evidenceSections: [],
      evidenceTextLines: ['当前路径下样本量较小，暂无法形成稳定证据，建议扩大日期范围或减少筛选条件后再分析。'],
      keyPathText,
      hasStableEvidence: false,
    };
  }

  return {
    keyPathFilters,
    evidenceSections,
    evidenceTextLines,
    keyPathText,
    hasStableEvidence: true,
  };
}

function buildActionItems(
  overviewItems: ReviewOverviewItem[],
  diagnosis: DiagnosisResult | null,
  evidence: ReturnType<typeof findEvidenceForReviewSummary>,
  metricKey: string,
): string[] {
  const actions = new Set<string>();
  const isWorse = (metric: string) => overviewItems.some((item) => item.metricKey === metric && item.status === '变差');

  const accountTop = evidence.evidenceSections.find((item) => item.dimension === '账户命名')?.rows[0];
  const adgroupTop = evidence.evidenceSections.find((item) => item.dimension === '广告组名称')?.rows[0];
  const concretePath = [
    ...evidence.keyPathFilters.map((item) => `${item.dimension}=${item.value}`),
    accountTop ? `账户命名=${accountTop.dimensionValue}` : '',
    adgroupTop ? `广告组名称=${adgroupTop.dimensionValue}` : '',
  ].filter(Boolean).join(' + ');

  if (concretePath) {
    actions.add(`建议优先排查「${concretePath}」这条路径，重点确认预算调整、素材变化、出价变化或转化回传变化。`);
  }

  if (!adgroupTop && accountTop) {
    actions.add(`当前路径下广告组分布较分散，建议优先查看账户命名「${accountTop.dimensionValue}」下的 Top 5 广告组。`);
  }

  if (isWorse('当日付费人数') || metricKey === '当日付费人数') {
    actions.add('数量类指标波动建议检查预算是否下降、计划是否暂停、素材是否衰退、转化回传是否异常。');
  }
  if (isWorse('当日付费成本') || isWorse('当日连麦成本') || isWorse('3日付费成本') || COST_METRICS.has(metricKey)) {
    actions.add('成本类指标建议检查消耗是否上涨但付费人数未同步增长，并核对出价和预算是否放量。');
  }
  if (isWorse('当日付费ROI') || isWorse('3日付费ROI') || ROI_METRICS.has(metricKey)) {
    actions.add('ROI 类指标建议检查付费金额变化、高消耗低回收广告组以及付费转化和客单价变化。');
  }
  if (isWorse('3日付费率') || FUNNEL_METRICS.has(metricKey)) {
    actions.add('漏斗率类指标建议按漏斗环节逐段检查：入口流量、直播间承接、连麦和付费转化。');
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
  const { context, overviewItems, coreConclusions, evidenceSections, evidenceTextLines, dragItems, actionItems, pendingChecks } = data;
  const rangeText = context.dateRange ? `${context.dateRange[0]} 至 ${context.dateRange[1]}` : '全部日期';

  const overviewRows = overviewItems
    .map((item) => `| ${item.metricKey} | ${formatValue(item.current, item.type)} | ${formatValue(item.previous, item.type)} | ${formatChange(item.changePct)} | ${item.status} |`)
    .join('\n');

  const evidenceSectionText = evidenceSections.length
    ? evidenceSections
      .map((section, sectionIndex) => {
        const rows = section.rows.map((row) => `| ${row.dimensionValue} | ${formatGeneralValue(row.currentValue, context.selectedMetric)} | ${formatGeneralValue(row.previousValue, context.selectedMetric)} | ${formatGeneralValue(row.changeValue, context.selectedMetric)} | ${formatChange(row.changeRate)} | ${formatContribution(row.contribution)} | ${row.reason} |`).join('\n');
        return [
          `### ${sectionIndex + 1}. ${section.dimension}维度`,
          '',
          `| ${section.dimension} | 当前周期 | 上一周期 | 变化 | 变化率 | 贡献度 | 判断 |`,
          '|---|---:|---:|---:|---:|---:|---|',
          rows,
          '',
        ].join('\n');
      })
      .join('\n')
    : '当前路径下样本量较小，暂无法形成稳定证据，建议扩大日期范围或减少筛选条件后再分析。';

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
    '## 四、关键证据',
    ...evidenceTextLines,
    '',
    evidenceSectionText,
    '## 五、主要拖累 / 驱动路径',
    dragText,
    '',
    '## 六、建议动作',
    ...actionItems.map((line, index) => `${index + 1}. ${line}`),
    '',
    '## 七、待进一步确认',
    ...pendingChecks.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n');
}

export function generateReviewSummary(params: {
  context: ReviewContext;
  overviewItems: ReviewOverviewItem[];
  diagnosisResult: DiagnosisResult | null;
  selectedMetric: string;
  rows: DataRow[];
  currentRange: [string, string] | null;
}): ReviewSummaryData {
  const { context, overviewItems, diagnosisResult, selectedMetric, rows, currentRange } = params;

  const primaryMetric = pickPrimaryMetric(overviewItems, selectedMetric);
  const fallbackSummary = diagnosisResult && diagnosisResult.summary.metricKey === primaryMetric
    ? diagnosisResult
    : diagnosisResult;

  const coreConclusions = buildCoreConclusions(overviewItems, fallbackSummary);
  const evidence = findEvidenceForReviewSummary({
    rows,
    metricKey: fallbackSummary?.summary.metricKey ?? selectedMetric,
    diagnosisResult: fallbackSummary,
    currentRange,
  });
  const dragItems = buildDragItems(fallbackSummary);
  const actionItems = buildActionItems(overviewItems, fallbackSummary, evidence, fallbackSummary?.summary.metricKey ?? selectedMetric);
  const pendingChecks = buildPendingChecks();

  const baseData = {
    context,
    overviewItems,
    coreConclusions,
    evidenceSections: evidence.evidenceSections,
    evidenceTextLines: evidence.evidenceTextLines,
    dragItems,
    actionItems,
    pendingChecks,
  };

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
