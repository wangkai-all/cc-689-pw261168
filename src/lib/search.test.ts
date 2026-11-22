import { describe, expect, it } from 'vitest';
import { inspectionData } from '../data/inspection';
import { popcount32, prepareData } from './coverage';
import { plansWithinBudget, searchPlans } from './search';
import type { InspectionData, Site } from './types';

const prepared = prepareData(inspectionData);

function selectionUnion(siteIds: string[]): number {
  let union = 0;
  for (const id of siteIds) {
    const index = inspectionData.sites.findIndex((site) => site.id === id);
    union |= prepared.siteDeviceMask[index];
  }
  return union;
}

function feasibleByBruteForce(siteIds: string[]): boolean {
  const union = selectionUnion(siteIds);
  let must = 0;
  for (const device of inspectionData.devices) {
    if (device.mustCheck) must |= 1 << prepared.deviceBit.get(device.id)!;
  }
  if ((union & must) !== must) return false;
  for (const requirement of inspectionData.defaultRequirements) {
    if (popcount32(union & prepared.groupMask.get(requirement.group)!) < requirement.min) {
      return false;
    }
  }
  return true;
}

const defaultInput = {
  data: inspectionData,
  requirements: inspectionData.defaultRequirements,
  mustCheckDeviceIds: inspectionData.defaultMustCheck,
  lockedSiteIds: [] as string[],
};

describe('覆盖集合', () => {
  it('同一设备被多个站点覆盖只计一次', () => {
    const result = searchPlans(defaultInput);
    const point = result.frontier[0];
    const detail = point.representative.detail;
    expect(detail.metrics.coverage).toBe(popcount32(selectionUnion(detail.siteIds)));
    expect(detail.assigned).toBeGreaterThanOrEqual(detail.metrics.coverage);
    expect(detail.duplicates).toBe(detail.assigned - detail.metrics.coverage);
    // 明细中逐站新增覆盖之和恰好等于去重覆盖。
    expect(detail.perSite.reduce((sum, row) => sum + row.added, 0)).toBe(detail.metrics.coverage);
  });

  it('汇总指标与明细指标来自同一次搜索', () => {
    const result = searchPlans(defaultInput);
    for (const point of result.frontier) {
      expect(point.representative.metrics).toEqual({
        cost: point.cost,
        coverage: point.coverage,
        highRiskCoverage: point.highRiskCoverage,
      });
      expect(point.representative.detail.metrics).toEqual(point.representative.metrics);
      expect(point.representative.detail.siteIds).toEqual(
        inspectionData.sites
          .filter((site) => (point.representative.mask & (1 << inspectionData.sites.indexOf(site))) !== 0)
          .map((site) => site.id),
      );
    }
  });
});

describe('精确前沿', () => {
  it('前沿与穷举的非支配集合一致', () => {
    const result = searchPlans(defaultInput);
    // 用原始 2^15 种子集独立枚举所有可行方案的三维指标。
    const cells = new Set<string>();
    const sites = inspectionData.sites;
    for (let mask = 0; mask < 1 << sites.length; mask += 1) {
      const ids = sites.filter((_, index) => (mask & (1 << index)) !== 0).map((site) => site.id);
      if (!feasibleByBruteForce(ids)) continue;
      const union = selectionUnion(ids);
      const cost = sites.reduce((sum, site, index) => ((mask & (1 << index)) !== 0 ? sum + site.cost : sum), 0);
      cells.add(`${cost}|${popcount32(union)}|${popcount32(union & prepared.highRiskMask)}`);
    }
    const parsed = [...cells].map((key) => {
      const [cost, coverage, highRiskCoverage] = key.split('|').map(Number);
      return { cost, coverage, highRiskCoverage };
    });
    const undominated = parsed.filter(
      (candidate) =>
        !parsed.some(
          (other) =>
            other !== candidate &&
            other.cost <= candidate.cost &&
            other.coverage >= candidate.coverage &&
            other.highRiskCoverage >= candidate.highRiskCoverage &&
            (other.cost < candidate.cost ||
              other.coverage > candidate.coverage ||
              other.highRiskCoverage > candidate.highRiskCoverage),
        ),
    );
    expect(result.frontier.length).toBe(undominated.length);
    expect(new Set(result.frontier.map((point) => point.key))).toEqual(
      new Set(undominated.map((point) => `${point.cost}|${point.coverage}|${point.highRiskCoverage}`)),
    );
    expect(result.feasibleCount).toBe(
      (() => {
        let count = 0;
        for (let mask = 0; mask < 1 << sites.length; mask += 1) {
          const ids = sites.filter((_, index) => (mask & (1 << index)) !== 0).map((site) => site.id);
          if (feasibleByBruteForce(ids)) count += 1;
        }
        return count;
      })(),
    );
  });

  it('前沿中的任一方案都不被另一前沿方案支配', () => {
    const result = searchPlans(defaultInput);
    for (const point of result.frontier) {
      const dominator = result.frontier.find(
        (other) =>
          other.id !== point.id &&
          other.cost <= point.cost &&
          other.coverage >= point.coverage &&
          other.highRiskCoverage >= point.highRiskCoverage &&
          (other.cost < point.cost ||
            other.coverage > point.coverage ||
            other.highRiskCoverage > point.highRiskCoverage),
      );
      expect(dominator).toBeUndefined();
    }
  });

  it('预算只筛选前沿，不改变前沿与最低费用', () => {
    const result = searchPlans(defaultInput);
    const low = plansWithinBudget(result, 40);
    const high = plansWithinBudget(result, 200);
    expect(low.withinBudget.length + low.exited.length).toBe(result.frontier.length);
    expect(high.withinBudget.length).toBe(result.frontier.length);
    expect(result.minFeasibleCost).toBe(33);
    expect(low.budgetShortfall).toBeNull();
    expect(plansWithinBudget(result, 20).budgetShortfall).toBe(13);
  });

  it('被支配方案给出的理由真实成立', () => {
    const result = searchPlans(defaultInput);
    expect(result.dominatedSamples.length).toBeGreaterThan(0);
    for (const sample of result.dominatedSamples) {
      const witness = result.frontier.find((point) => point.id === sample.reason.witnessId)!;
      expect(witness).toBeDefined();
      expect(witness.cost).toBeLessThanOrEqual(sample.cost);
      expect(witness.coverage).toBeGreaterThanOrEqual(sample.coverage);
      expect(witness.highRiskCoverage).toBeGreaterThanOrEqual(sample.highRiskCoverage);
      expect(
        witness.cost < sample.cost ||
          witness.coverage > sample.coverage ||
          witness.highRiskCoverage > sample.highRiskCoverage,
      ).toBe(true);
      expect(sample.reason.summary).toContain(witness.id);
    }
  });

  it('锁定站点后只搜索剩余站点，且锁定站计入费用与覆盖', () => {
    const result = searchPlans({ ...defaultInput, lockedSiteIds: ['ST-E'] });
    expect(result.stats.searchedSites).toBe(14);
    expect(result.stats.lockedSites).toBe(1);
    expect(result.lockedCost).toBe(19);
    // 锁定后仍受必检与组最低覆盖约束，可行数不超过剩余组合数。
    expect(result.stats.combinations).toBe(2 ** 14);
    expect(result.feasibleCount).toBeLessThanOrEqual(2 ** 14);
    for (const point of result.frontier) {
      expect(point.representative.detail.siteIds).toContain('ST-E');
      expect(point.representative.detail.metrics.cost).toBeGreaterThanOrEqual(19);
    }
    const withoutLock = searchPlans(defaultInput);
    expect(result.frontier.length).toBeLessThanOrEqual(withoutLock.frontier.length);
  });
});

describe('不可行诊断', () => {
  it('必检设备没有任何候选站点时明确指出', () => {
    const result = searchPlans({ ...defaultInput, mustCheckDeviceIds: ['T1', 'F6'] });
    expect(result.frontier).toEqual([]);
    const issue = result.structuralIssues.find((item) => item.kind === 'uncoverable-must-check');
    expect(issue).toBeDefined();
    expect(issue!.deviceIds).toEqual(['F6']);
    expect(issue!.message).toContain('消防水池液位计');
  });

  it('组最低覆盖量超过可覆盖设备时给出诊断', () => {
    const requirements = inspectionData.defaultRequirements.map((item) =>
      item.group === 'fire' ? { ...item, min: 6 } : item,
    );
    const result = searchPlans({ ...defaultInput, requirements });
    expect(result.frontier).toEqual([]);
    const issue = result.structuralIssues.find((item) => item.kind === 'group-min-above-coverable');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('5');
  });

  it('预算低于最低可行费用时说明差额', () => {
    const result = searchPlans(defaultInput);
    const view = plansWithinBudget(result, 20);
    expect(view.withinBudget).toEqual([]);
    expect(view.budgetShortfall).toBe(13);
  });
});

describe('样本规模约束', () => {
  it('超过 20 个站点时拒绝精确搜索并给出原因', () => {
    const sites: Site[] = Array.from({ length: 21 }, (_, index) => ({
      id: `X-${index}`,
      name: `站点 ${index}`,
      shortName: `S${index}`,
      cost: index + 1,
      problemTypes: [],
      devices: ['T1'],
    }));
    const oversized: InspectionData = {
      ...inspectionData,
      sites,
    };
    expect(() =>
      searchPlans({
        data: oversized,
        requirements: [],
        mustCheckDeviceIds: [],
        lockedSiteIds: [],
      }),
    ).toThrow(/20/);
  });
});
