import dayjs from 'dayjs';
import { getMetricTrendDirection, getMetricType, metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import type { DiagnosisDimensionResult, DiagnosisResult, DiagnosisSecondaryDimensionResult } from '../types/diagnosis';
import { normalizeExcelDate } from './date';

const EPSILON = 0.0001;
const SMALL_SAMPLE_THRESHOLD = 20;
const SECONDARY_DIMENSIONS = ['渠道', '代理', '版位', '操作系统', '账户命名', '优化目标', '出价方式', '账户ID', '广告组ID'];

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

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPreviousPeriod([start, end]: [string, string]): [string, string] {
  const days = dayjs(end).diff(dayjs(start), 'day') + 1;
  return [dayjs(start).subtract(days, 'day').format('YYYY-MM-DD'), dayjs(start).subtract(1, 'day').format('YYYY-MM-DD')];
}

function isInRange(date: string, range: [string, string]) {
  return date >= range[0] && date <= range[1];
}

function getStatus(changeRate: number | null, direction: ReturnType<typeof getMetricTrendDirection>): '变好' | '变差' | '持平' | '上升' | '下降' {
  if (changeRate === null || Math.abs(changeRate) <= EPSILON) return '持平';
  if (direction === 'higher_better') return changeRate > 0 ? '变好' : '变差';
  if (direction === 'lower_better') return changeRate < 0 ? '变好' : '变差';
  return changeRate > 0 ? '上升' : '下降';
}

function ratioChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function toPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(2)}%`;
}

function formatMetricText(value: number | null, metricType: ReturnType<typeof getMetricType>) {
  if (value === null || !Number.isFinite(value)) return '暂无可用数据';
  if (metricType === 'number') return `${Math.round(value)}`;
  return `${value.toFixed(2)}`;
}

function getSecondaryConclusion(options: {
  secondary: { group: string; row: DiagnosisSecondaryDimensionResult['rows'][number] } | undefined;
  metricType: ReturnType<typeof getMetricType>;
}) {
  const { secondary, metricType } = options;
  if (!secondary) return '当前二级下钻数据不足，建议优先结合聚合明细表进一步确认具体影响路径。';
  if (secondary.row.sampleWarning) {
    return `继续下钻发现，「${secondary.group}=${secondary.row.dimensionValue}」变化较明显，但样本量较小，结论仅供参考，建议结合广告组明细进一步确认。`;
  }
  const contributionText = toPct(secondary.row.contribution);
  if (contributionText) {
    return `继续下钻发现，「${secondary.group}=${secondary.row.dimensionValue}」贡献了该路径变化的 ${contributionText}，是主要影响因素。`;
  }
  const currentMetric = formatMetricText(secondary.row.currentMetric, metricType);
  const previousMetric = formatMetricText(secondary.row.previousMetric, metricType);
  const delta = (secondary.row.currentMetric ?? 0) - (secondary.row.previousMetric ?? 0);
  const deltaText = metricType === 'number' ? `${Math.round(delta)}` : delta.toFixed(2);
  return `继续下钻发现，「${secondary.group}=${secondary.row.dimensionValue}」变化最明显，当前周期为 ${currentMetric}，上期为 ${previousMetric}，变化 ${deltaText}，是该路径下最值得关注的维度值。`;
}

function buildFormulaReason(metricKey: string, nc: number, np: number, dc: number, dp: number, sampleWarning: boolean) {
  if (sampleWarning) return '样本量较小，波动仅供参考';

  const numeratorChange = ratioChange(nc, np);
  const denominatorChange = ratioChange(dc, dp);

  if (COST_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) > 0.02 && (denominatorChange ?? 0) <= 0.01) return `消耗上升 ${toPct(numeratorChange)}，但分母未同步增长，导致成本上升`;
    if (Math.abs(numeratorChange ?? 0) <= 0.03 && (denominatorChange ?? 0) < -0.03) return `消耗基本持平（${toPct(numeratorChange)}），但分母下降 ${toPct(denominatorChange)}，导致成本升高`;
    if ((numeratorChange ?? 0) < -0.01 && (denominatorChange ?? 0) < -0.01 && Math.abs(denominatorChange ?? 0) > Math.abs(numeratorChange ?? 0)) {
      return `消耗下降 ${toPct(numeratorChange)}，但分母下降更快（${toPct(denominatorChange)}），成本仍上升`;
    }
    return '分母较小，成本波动仅供参考';
  }

  if (ROI_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.03 && (denominatorChange ?? 0) >= -0.01) return `付费金额下降 ${toPct(numeratorChange)}，但消耗未同步下降，导致 ROI 下滑`;
    if ((denominatorChange ?? 0) > 0.03 && (numeratorChange ?? 0) <= 0.01) return `消耗上升 ${toPct(denominatorChange)}，但付费金额增长不足，导致 ROI 下滑`;
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) {
      return `付费金额和消耗均下降，但付费金额下降更快（${toPct(numeratorChange)} vs ${toPct(denominatorChange)}）`;
    }
    return '消耗较小，ROI 波动仅供参考';
  }

  if (FUNNEL_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.03 && Math.abs(denominatorChange ?? 0) <= 0.02) return `分子下降 ${toPct(numeratorChange)}，分母基本持平，导致转化率下降`;
    if ((denominatorChange ?? 0) > 0.03 && (numeratorChange ?? 0) <= 0.01) return `分母增长 ${toPct(denominatorChange)}，但分子未同步增长，导致转化率下降`;
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) {
      return `分子分母均下降，但分子下降更快（${toPct(numeratorChange)} vs ${toPct(denominatorChange)}）`;
    }
    return '样本量较小，波动仅供参考';
  }

  return '核心指标波动';
}

function buildActionByPath(path: string[]) {
  const pathText = path.join(' + ');
  if (path.includes('渠道') && path.includes('代理')) {
    return `建议优先排查「${pathText}」下的账户命名、账户ID和广告组ID，重点查看消耗、付费人数、付费成本、ROI、素材变化、预算调整和转化回传。`;
  }
  if (path.includes('操作系统')) return `建议重点对比「${pathText}」下的素材点击率、落地页进入、直播间承接和付费转化。`;
  if (path.includes('广告组ID')) return `建议优先查看「${pathText}」近期是否存在预算调整、出价变化、素材衰退、计划暂停或回传异常。`;
  if (path.includes('广告组名称')) return `建议优先查看「${pathText}」对应广告组近期是否存在预算调整、出价变化、素材衰退、计划暂停或回传异常。`;
  if (path.includes('渠道')) return `优先检查「${pathText}」下的消耗、人数与 ROI 是否同步变化。`;
  if (path.includes('账户命名') || path.includes('账户ID') || path.includes('账户名称')) return `检查 ${pathText} 是否存在预算调整、计划暂停或素材衰退`;
  return `围绕 ${pathText} 继续逐层排查关键账户ID与广告组ID`;
}

function resolveDrillDimensions(fieldKeys: Set<string>): string[] {
  const dimensions = SECONDARY_DIMENSIONS.filter((dimension) => fieldKeys.has(dimension));
  if (!fieldKeys.has('账户ID') && fieldKeys.has('账户名称')) dimensions.push('账户名称');
  if (!fieldKeys.has('广告组ID') && fieldKeys.has('广告组名称')) dimensions.push('广告组名称');
  return dimensions;
}

export function runDiagnosis(params: {
  rows: DataRow[];
  metricKey: string;
  currentRange: [string, string] | null;
  dimensions: string[];
}): DiagnosisResult | null {
  const { rows, metricKey, currentRange, dimensions } = params;
  if (!currentRange) return null;

  const previousRange = getPreviousPeriod(currentRange);
  const metricConfig = metricConfigMap.get(metricKey);
  const metricType = getMetricType(metricKey);
  const direction = getMetricTrendDirection(metricKey);
  const summaryMetricMode = metricConfig?.mode ?? 'unknown';
  const summaryNumeratorField = metricConfig?.mode === 'formula' ? metricConfig.numerator : metricConfig?.mode === 'source' || metricConfig?.mode === 'daily_average_source' ? metricConfig.sourceField : metricKey;
  const summaryDenominatorField = metricConfig?.mode === 'formula' ? metricConfig.denominator : metricConfig?.mode === 'daily_average_source' ? '日期天数' : null;

  const fieldKeys = new Set(rows.flatMap((row) => Object.keys(row)));
  if (metricConfig?.mode === 'formula' && (!fieldKeys.has(metricConfig.numerator) || !fieldKeys.has(metricConfig.denominator))) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, metricMode: summaryMetricMode, numeratorField: summaryNumeratorField, denominatorField: summaryDenominatorField, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: '缺少必要字段，无法诊断该指标',
      conclusionLines: ['缺少必要字段，无法诊断该指标。', '建议补齐指标分子分母字段后重新诊断。', '可先查看聚合明细确认异常维度。'],
      dimensionResults: [],
      suggestions: [],
      error: '缺少必要字段，无法诊断该指标',
    };
  }

  type PeriodRow = DataRow & { __date: string | null };
  const periodRows: PeriodRow[] = rows
    .map((row) => ({ ...row, __date: normalizeExcelDate(row.日期) }))
    .filter((row) => row.__date && (isInRange(row.__date, currentRange) || isInRange(row.__date, previousRange))) as PeriodRow[];

  const currentRows = periodRows.filter((row) => row.__date && isInRange(row.__date, currentRange));
  const previousRows = periodRows.filter((row) => row.__date && isInRange(row.__date, previousRange));

  if (!currentRows.length || !previousRows.length) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, metricMode: summaryMetricMode, numeratorField: summaryNumeratorField, denominatorField: summaryDenominatorField, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: !currentRows.length ? '当前筛选条件下暂无数据' : '暂无上一周期数据，无法计算环比',
      conclusionLines: [
        !currentRows.length ? '当前筛选条件下暂无可用数据，暂无法形成周期对比结论。' : '暂无上一周期数据，暂无法形成环比结论。',
        '建议先核对筛选条件、日期范围和指标字段完整性。',
        '可先通过明细表观察高消耗与高波动维度，辅助人工判断。',
      ],
      dimensionResults: [],
      suggestions: [],
      error: !currentRows.length ? '当前筛选条件下暂无数据' : '暂无上一周期数据，无法计算环比',
    };
  }

  const sumByField = (targetRows: PeriodRow[], field: string) => targetRows.reduce((acc, row) => acc + toNumber(row[field]), 0);

  const defaultNumerator = metricConfig?.mode === 'formula' ? metricConfig.numerator : metricConfig?.sourceField ?? metricKey;
  const defaultDenominator = metricConfig?.mode === 'formula' ? metricConfig.denominator : '日期天数';

  const calcMetric = (numerator: number, denominator: number) => {
    if (metricConfig?.mode === 'formula' || metricConfig?.mode === 'daily_average_source') return denominator > 0 ? numerator / denominator : null;
    return numerator;
  };

  const totalNumeratorCurrent = sumByField(currentRows, defaultNumerator);
  const totalNumeratorPrevious = sumByField(previousRows, defaultNumerator);
  const totalDenominatorCurrent = metricConfig?.mode === 'formula'
    ? sumByField(currentRows, defaultDenominator)
    : metricConfig?.mode === 'daily_average_source'
      ? new Set(currentRows.map((row) => row.__date).filter(Boolean)).size
      : currentRows.length;
  const totalDenominatorPrevious = metricConfig?.mode === 'formula'
    ? sumByField(previousRows, defaultDenominator)
    : metricConfig?.mode === 'daily_average_source'
      ? new Set(previousRows.map((row) => row.__date).filter(Boolean)).size
      : previousRows.length;

  const currentValue = calcMetric(totalNumeratorCurrent, totalDenominatorCurrent);
  const previousValue = calcMetric(totalNumeratorPrevious, totalDenominatorPrevious);
  const changeValue = currentValue !== null && previousValue !== null ? currentValue - previousValue : null;
  const changeRate = currentValue !== null && previousValue !== null && previousValue !== 0 ? (currentValue - previousValue) / previousValue : null;
  const status = getStatus(changeRate, direction);

  const allDrillDimensions = resolveDrillDimensions(fieldKeys);

  const buildGroupedRows = (
    targetCurrentRows: PeriodRow[],
    targetPreviousRows: PeriodRow[],
    dimension: string,
  ) => {
    const grouped = new Map<string, { nc: number; np: number; dc: number; dp: number; currentDays: Set<string>; previousDays: Set<string> }>();

    const addRow = (row: PeriodRow, isCurrent: boolean) => {
      const key = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
      if (!grouped.has(key)) grouped.set(key, { nc: 0, np: 0, dc: 0, dp: 0, currentDays: new Set<string>(), previousDays: new Set<string>() });
      const item = grouped.get(key)!;
      if (isCurrent) {
        item.nc += toNumber(row[defaultNumerator]);
        if (metricConfig?.mode === 'formula') item.dc += toNumber(row[defaultDenominator]);
        if (metricConfig?.mode === 'daily_average_source' && row.__date) item.currentDays.add(row.__date);
      } else {
        item.np += toNumber(row[defaultNumerator]);
        if (metricConfig?.mode === 'formula') item.dp += toNumber(row[defaultDenominator]);
        if (metricConfig?.mode === 'daily_average_source' && row.__date) item.previousDays.add(row.__date);
      }
    };

    targetCurrentRows.forEach((row) => addRow(row, true));
    targetPreviousRows.forEach((row) => addRow(row, false));

    const allRows = Array.from(grouped.entries()).map(([dimensionValue, item]) => {
      const denominatorCurrent = metricConfig?.mode === 'daily_average_source' ? item.currentDays.size : item.dc;
      const denominatorPrevious = metricConfig?.mode === 'daily_average_source' ? item.previousDays.size : item.dp;
      const currentMetric = calcMetric(item.nc, denominatorCurrent);
      const previousMetric = calcMetric(item.np, denominatorPrevious);
      const metricDelta = currentMetric !== null && previousMetric !== null ? currentMetric - previousMetric : 0;
      const sampleWarning = denominatorPrevious < SMALL_SAMPLE_THRESHOLD || denominatorCurrent < SMALL_SAMPLE_THRESHOLD;
      return {
        key: `${dimension}-${dimensionValue}`,
        dimensionValue,
        currentMetric,
        previousMetric,
        changeRate: previousMetric !== null && previousMetric !== 0 && currentMetric !== null ? (currentMetric - previousMetric) / previousMetric : null,
        numeratorCurrent: item.nc,
        numeratorPrevious: item.np,
        denominatorCurrent,
        denominatorPrevious,
        sampleWarning,
        metricDelta,
      };
    });

    const totalDelta = allRows.reduce((sum, item) => sum + item.metricDelta, 0);
    const sameDirectionRows = allRows.filter((item) => (totalDelta < 0 ? item.metricDelta < 0 : item.metricDelta > 0));
    const sameDirectionSum = Math.abs(sameDirectionRows.reduce((sum, item) => sum + item.metricDelta, 0));

    return allRows.map((item) => {
      const contribution = item.metricDelta === 0 || sameDirectionSum <= EPSILON || Math.sign(item.metricDelta) !== Math.sign(totalDelta)
        ? null
        : Math.abs(item.metricDelta) / sameDirectionSum;
      const impactScore = metricConfig?.mode === 'source'
        ? Math.abs(item.metricDelta)
        : (Math.abs(item.metricDelta) * (item.denominatorCurrent + item.denominatorPrevious)) / 2;
      return {
        ...item,
        contribution,
        impactScore: item.sampleWarning ? impactScore * 0.5 : impactScore,
      };
    });
  };

  const dimensionResults: DiagnosisDimensionResult[] = dimensions.map((dimension) => {
    const rowsByDimension = buildGroupedRows(currentRows, previousRows, dimension)
      .map((item) => {
        const valueDiff = (item.currentMetric ?? 0) - (item.previousMetric ?? 0);
        const reason = metricConfig?.mode === 'source'
          ? (() => {
            const contributionText = toPct(item.contribution);
            if (contributionText) {
              return `${dimension}=${item.dimensionValue} ${valueDiff >= 0 ? '上升' : '下降'} ${Math.abs(valueDiff).toFixed(metricType === 'number' ? 0 : 2)}，贡献 ${contributionText}`;
            }
            return `${dimension}=${item.dimensionValue} ${valueDiff >= 0 ? '上升' : '下降'} ${Math.abs(valueDiff).toFixed(metricType === 'number' ? 0 : 2)}，贡献度暂无法计算，但该维度变化最明显`;
          })()
          : buildFormulaReason(metricKey, item.numeratorCurrent, item.numeratorPrevious, item.denominatorCurrent, item.denominatorPrevious, item.sampleWarning);

        const secondaryResults: DiagnosisSecondaryDimensionResult[] = allDrillDimensions
          .filter((subDimension) => subDimension !== dimension)
          .map((subDimension) => {
            const scopedCurrentRows = currentRows.filter((row) => {
              const value = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
              return value === item.dimensionValue;
            });
            const scopedPreviousRows = previousRows.filter((row) => {
              const value = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
              return value === item.dimensionValue;
            });

            const subRows = buildGroupedRows(scopedCurrentRows, scopedPreviousRows, subDimension)
              .map((subItem) => ({
                ...subItem,
                reason: metricConfig?.mode === 'source'
                  ? (() => {
                    const contributionText = toPct(subItem.contribution);
                    if (contributionText) {
                      return `${subDimension}=${subItem.dimensionValue} 对 ${dimension}=${item.dimensionValue} 贡献 ${contributionText}`;
                    }
                    return `${subDimension}=${subItem.dimensionValue} 对 ${dimension}=${item.dimensionValue} 贡献度暂无法计算，但该维度变化最明显`;
                  })()
                  : buildFormulaReason(metricKey, subItem.numeratorCurrent, subItem.numeratorPrevious, subItem.denominatorCurrent, subItem.denominatorPrevious, subItem.sampleWarning),
              }));

            const sorted = subRows
              .sort((a, b) => {
                if (metricConfig?.mode === 'source') return b.impactScore - a.impactScore;
                if (COST_METRICS.has(metricKey)) {
                  const aCostUp = ((a.currentMetric ?? 0) - (a.previousMetric ?? 0)) > 0 ? 1 : 0;
                  const bCostUp = ((b.currentMetric ?? 0) - (b.previousMetric ?? 0)) > 0 ? 1 : 0;
                  if (aCostUp !== bCostUp) return bCostUp - aCostUp;
                  return b.impactScore - a.impactScore;
                }
                const aDown = ((a.currentMetric ?? 0) - (a.previousMetric ?? 0)) < 0 ? 1 : 0;
                const bDown = ((b.currentMetric ?? 0) - (b.previousMetric ?? 0)) < 0 ? 1 : 0;
                if (aDown !== bDown) return bDown - aDown;
                return b.impactScore - a.impactScore;
              })
              .slice(0, 5);

            return { dimension: subDimension, rows: sorted };
          })
          .filter((group) => group.rows.length > 0);

        return {
          ...item,
          reason,
          action: buildActionByPath([dimension]),
          secondaryResults,
        };
      })
      .sort((a, b) => b.impactScore - a.impactScore);

    return { dimension, rows: rowsByDimension };
  });

  const primary = dimensionResults.flatMap((group) => group.rows.slice(0, 1).map((row) => ({ group: group.dimension, row })))[0];
  const secondary = primary?.row.secondaryResults?.flatMap((group) => group.rows.slice(0, 1).map((row) => ({ group: group.dimension, row })))
    .sort((a, b) => b.row.impactScore - a.row.impactScore)?.[0];

  const primaryContribution = toPct(primary?.row.contribution ?? null);
  const metricImprovement = changeRate === null
    ? '暂无可比结论'
    : (() => {
      if (status === '变好') return '指标表现变好';
      if (status === '变差') return '指标表现变差';
      return '指标整体基本持平';
    })();

  const metricLine = (() => {
    if (changeRate === null) return `当前周期「${metricKey}」暂无可比结果，建议先补齐上一周期数据后再判断趋势。`;
    const currentText = formatMetricText(currentValue, metricType);
    const previousText = formatMetricText(previousValue, metricType);
    const deltaText = formatMetricText(changeValue, metricType);
    if (COST_METRICS.has(metricKey)) {
      const numeratorRate = ratioChange(totalNumeratorCurrent, totalNumeratorPrevious);
      const denominatorRate = ratioChange(totalDenominatorCurrent, totalDenominatorPrevious);
      return `当前周期「${metricKey}」为 ${currentText}，上期为 ${previousText}，变化 ${deltaText}（${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(2)}%），${status === '变好' ? '成本改善' : status === '变差' ? '成本变差' : '成本基本持平'}；消耗变化 ${toPct(numeratorRate) ?? '暂无可比结果'}，分母人数变化 ${toPct(denominatorRate) ?? '暂无可比结果'}。`;
    }
    if (ROI_METRICS.has(metricKey)) {
      const revenueRate = ratioChange(totalNumeratorCurrent, totalNumeratorPrevious);
      const spendRate = ratioChange(totalDenominatorCurrent, totalDenominatorPrevious);
      return `当前周期「${metricKey}」为 ${currentText}，上期为 ${previousText}，变化 ${deltaText}（${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(2)}%），${status === '变好' ? 'ROI 改善' : status === '变差' ? 'ROI 变差' : 'ROI 基本持平'}；付费金额变化 ${toPct(revenueRate) ?? '暂无可比结果'}，消耗变化 ${toPct(spendRate) ?? '暂无可比结果'}。`;
    }
    if (FUNNEL_METRICS.has(metricKey)) {
      const numeratorRate = ratioChange(totalNumeratorCurrent, totalNumeratorPrevious);
      const denominatorRate = ratioChange(totalDenominatorCurrent, totalDenominatorPrevious);
      return `当前周期「${metricKey}」为 ${currentText}，上期为 ${previousText}，变化 ${deltaText}（${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(2)}%）；分子变化 ${toPct(numeratorRate) ?? '暂无可比结果'}，分母变化 ${toPct(denominatorRate) ?? '暂无可比结果'}，需判断是否为分子下降或分母增长未跟上。`;
    }
    return `当前周期「${metricKey}」为 ${currentText}，上期为 ${previousText}，变化 ${deltaText}（${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(2)}%），${metricImprovement}。`;
  })();

  const primaryLine = (() => {
    if (!primary) return '一级下钻暂无明显集中维度，建议先查看渠道、代理与广告组ID分布变化。';
    if (primaryContribution) return `一级下钻看，变化主要来自「${primary.group}=${primary.row.dimensionValue}」，贡献 ${primaryContribution}。`;
    return `一级下钻看，「${primary.group}=${primary.row.dimensionValue}」变化最明显，但当前数据不足以计算贡献度，建议结合明细进一步确认。`;
  })();

  const secondaryLine = getSecondaryConclusion({ secondary, metricType });
  const suggestionLine = buildActionByPath(
    primary && secondary ? [primary.group, secondary.group] : primary ? [primary.group] : ['渠道', '广告组ID'],
  );
  const conclusionLines = [metricLine, primaryLine, secondaryLine, suggestionLine];
  const conclusion = conclusionLines.join(' ');

  const suggestions = [
    buildActionByPath(primary ? [primary.group] : ['维度']),
    buildActionByPath(primary && secondary ? [primary.group, secondary.group] : ['渠道', '广告组ID']),
    '优先核查关键路径下账户命名、账户ID、广告组ID、预算与素材变化',
  ];

  return {
    currentRange,
    previousRange,
    summary: { metricKey, metricType, metricMode: summaryMetricMode, numeratorField: summaryNumeratorField, denominatorField: summaryDenominatorField, currentValue, previousValue, changeValue, changeRate, status, direction },
    conclusion,
    conclusionLines,
    dimensionResults,
    suggestions,
  };
}
