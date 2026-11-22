import { prepareData, popcount32, type PreparedData } from './coverage';
import type {
  Device,
  DominanceReason,
  DominatedSample,
  FrontierPoint,
  GroupCoverageRow,
  GroupDiagnostic,
  PlanDetail,
  PlanMetrics,
  PlanSiteRow,
  PlanVariant,
  Requirement,
  SearchInput,
  SearchResult,
  SearchStats,
  Site,
  StructuralIssue,
} from './types';

/** 每个指标组合最多保留多少个真实站点组合用于「同指标不同选站」展示。 */
export const MAX_VARIANTS_PER_CELL = 6;
/** 被支配示例最多展示多少个。 */
export const MAX_DOMINATED_SAMPLES = 8;

interface VariantLite {
  mask: number;
  siteCount: number;
  assigned: number;
  duplicates: number;
}

interface MetricCell {
  key: string;
  cost: number;
  coverage: number;
  highRiskCoverage: number;
  count: number;
  variants: VariantLite[];
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function compareVariants(a: VariantLite, b: VariantLite): number {
  if (a.duplicates !== b.duplicates) return a.duplicates - b.duplicates;
  if (a.siteCount !== b.siteCount) return a.siteCount - b.siteCount;
  return a.mask - b.mask;
}

function normalizeRequirements(prepared: PreparedData, requirements: Requirement[]): Requirement[] {
  return prepared.data.groups.map((group) => {
    const total = prepared.groupDevices.get(group.id)!.length;
    const raw = requirements.find((item) => item.group === group.id)?.min ?? 0;
    const min = Math.max(0, Math.min(total, Math.floor(Number.isFinite(raw) ? raw : 0)));
    return { group: group.id, min };
  });
}

function buildGroupDiagnostics(
  prepared: PreparedData,
  requirements: Requirement[],
): GroupDiagnostic[] {
  return prepared.data.groups.map((group) => {
    const devices = prepared.groupDevices.get(group.id)!;
    const zeroCoverageDevices = devices.filter(
      (device) => (prepared.allCoveredMask & (1 << prepared.deviceBit.get(device.id)!)) === 0,
    );
    const coverableDevices = devices.length - zeroCoverageDevices.length;
    const minRequired = requirements.find((item) => item.group === group.id)?.min ?? 0;
    return {
      groupId: group.id,
      groupName: group.name,
      totalDevices: devices.length,
      coverableDevices,
      minRequired,
      structurallyImpossible: minRequired > coverableDevices,
      zeroCoverageDevices,
    };
  });
}

function buildStructuralIssues(
  prepared: PreparedData,
  mustCheckIds: string[],
  diagnostics: GroupDiagnostic[],
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const orphanMustCheck = mustCheckIds
    .map((id) => prepared.deviceById.get(id))
    .filter((device): device is Device => Boolean(device))
    .filter((device) => (prepared.allCoveredMask & (1 << prepared.deviceBit.get(device.id)!)) === 0);

  if (orphanMustCheck.length > 0) {
    issues.push({
      kind: 'uncoverable-must-check',
      title: '必检设备没有任何候选站点',
      message: `${orphanMustCheck
        .map((device) => `${device.name}（${device.id}）`)
        .join('、')} 不在任何候选站点的设备清单中。即使选上全部 ${
        prepared.data.sites.length
      } 个站点也无法覆盖，因此不存在可行方案。`,
      deviceIds: orphanMustCheck.map((device) => device.id),
      deviceNames: orphanMustCheck.map((device) => device.name),
    });
  }

  for (const diagnostic of diagnostics) {
    if (!diagnostic.structurallyImpossible) continue;
    const group = prepared.groupById.get(diagnostic.groupId)!;
    issues.push({
      kind: 'group-min-above-coverable',
      groupId: diagnostic.groupId,
      title: `${group.name}的最低覆盖量超过可覆盖设备数`,
      message: `${group.name}共有 ${diagnostic.totalDevices} 台设备，其中只有 ${diagnostic.coverableDevices} 台被候选站点覆盖；最低覆盖量设为 ${diagnostic.minRequired} 台，无法满足。`,
      deviceIds: diagnostic.zeroCoverageDevices.map((device) => device.id),
      deviceNames: diagnostic.zeroCoverageDevices.map((device) => device.name),
    });
  }

  return issues;
}

/** 根据站点位掩码生成完整方案明细；汇总与明细都从同一掩码出发。 */
export function buildPlanDetail(
  prepared: PreparedData,
  mask: number,
  requirements: Requirement[],
): PlanDetail {
  const selected: Site[] = [];
  prepared.data.sites.forEach((site, index) => {
    if ((mask & (1 << index)) !== 0) selected.push(site);
  });

  let covered = 0;
  let assigned = 0;
  const perSite: PlanSiteRow[] = [];

  selected.forEach((site) => {
    const index = prepared.data.sites.indexOf(site);
    const siteMask = prepared.siteDeviceMask[index];
    const addedMask = siteMask & ~covered;
    const duplicateMask = siteMask & covered;
    const addedDeviceIds = prepared.data.devices
      .filter((device) => (addedMask & (1 << prepared.deviceBit.get(device.id)!)) !== 0)
      .map((device) => device.id);
    const duplicateDeviceIds = prepared.data.devices
      .filter((device) => (duplicateMask & (1 << prepared.deviceBit.get(device.id)!)) !== 0)
      .map((device) => device.id);
    const added = popcount32(addedMask);
    const duplicate = popcount32(duplicateMask);
    assigned += added + duplicate;
    covered |= siteMask;
    perSite.push({ site, added, duplicate, addedDeviceIds, duplicateDeviceIds });
  });

  const coverage = popcount32(covered);
  const duplicates = assigned - coverage;
  const coveredDeviceIds: string[] = [];
  const missedDeviceIds: string[] = [];
  const coveredHighRiskDeviceIds: string[] = [];
  const missedHighRiskDeviceIds: string[] = [];
  const uncoverableDeviceIds: string[] = [];

  for (const device of prepared.data.devices) {
    const bit = 1 << prepared.deviceBit.get(device.id)!;
    if ((covered & bit) !== 0) {
      coveredDeviceIds.push(device.id);
      if (device.highRisk) coveredHighRiskDeviceIds.push(device.id);
    } else {
      missedDeviceIds.push(device.id);
      if (device.highRisk) missedHighRiskDeviceIds.push(device.id);
      if ((prepared.allCoveredMask & bit) === 0) uncoverableDeviceIds.push(device.id);
    }
  }

  const groupCoverage: GroupCoverageRow[] = prepared.data.groups.map((group) => {
    const devices = prepared.groupDevices.get(group.id)!;
    const groupMask = prepared.groupMask.get(group.id)!;
    const groupCovered = popcount32(covered & groupMask);
    const min = requirements.find((item) => item.group === group.id)?.min ?? 0;
    return {
      group,
      covered: groupCovered,
      total: devices.length,
      min,
      met: groupCovered >= min,
      missedDeviceIds: devices
        .filter((device) => (covered & (1 << prepared.deviceBit.get(device.id)!)) === 0)
        .map((device) => device.id),
    };
  });

  const problemSet = new Set<string>();
  selected.forEach((site) => site.problemTypes.forEach((type) => problemSet.add(type)));
  const problemTypes = prepared.data.problemTypes.filter((type) => problemSet.has(type));

  return {
    mask,
    metrics: {
      cost: selected.reduce((sum, site) => sum + site.cost, 0),
      coverage,
      highRiskCoverage: popcount32(covered & prepared.highRiskMask),
    },
    siteIds: selected.map((site) => site.id),
    sites: selected,
    siteCount: selected.length,
    assigned,
    duplicates,
    duplicateRate: assigned === 0 ? 0 : duplicates / assigned,
    perSite,
    coveredDeviceIds,
    missedDeviceIds,
    coveredHighRiskDeviceIds,
    missedHighRiskDeviceIds,
    groupCoverage,
    problemTypes,
    uncoverableDeviceIds,
  };
}

function toPlanVariant(
  prepared: PreparedData,
  cell: MetricCell,
  variant: VariantLite,
  requirements: Requirement[],
): PlanVariant {
  const detail = buildPlanDetail(prepared, variant.mask, requirements);
  return {
    mask: variant.mask,
    metrics: {
      cost: cell.cost,
      coverage: cell.coverage,
      highRiskCoverage: cell.highRiskCoverage,
    },
    siteCount: variant.siteCount,
    assigned: variant.assigned,
    duplicates: variant.duplicates,
    siteIds: detail.siteIds,
    detail,
  };
}

export function buildDominanceReason(
  witness: PlanMetrics,
  witnessId: string,
  witnessKey: string,
  target: PlanMetrics,
): DominanceReason {
  const clauses: string[] = [];
  if (witness.cost < target.cost) clauses.push(`费用低 ¥${target.cost - witness.cost}`);
  if (witness.coverage > target.coverage) clauses.push(`覆盖多 ${witness.coverage - target.coverage} 台`);
  if (witness.highRiskCoverage > target.highRiskCoverage) {
    clauses.push(`高风险覆盖多 ${witness.highRiskCoverage - target.highRiskCoverage} 台`);
  }
  const equalClauses: string[] = [];
  if (witness.cost === target.cost) equalClauses.push('费用相同');
  if (witness.coverage === target.coverage) equalClauses.push('覆盖相同');
  if (witness.highRiskCoverage === target.highRiskCoverage) equalClauses.push('高风险覆盖相同');

  const summary =
    equalClauses.length > 0
      ? `${witnessId} 与它${equalClauses.join('、')}，但${clauses.join('、')}。`
      : `${witnessId} 在费用、覆盖与高风险覆盖三项上都不差，且${clauses.join('、')}。`;

  return {
    witnessId,
    witnessKey,
    witness: {
      cost: witness.cost,
      coverage: witness.coverage,
      highRiskCoverage: witness.highRiskCoverage,
    },
    clauses,
    summary,
  };
}

/**
 * 三维 Pareto 非支配筛选：按费用升序、覆盖降序、高风险覆盖降序扫描，
 * 用后缀最大值判断「是否已存在费用不更高、覆盖不更少、高风险不更少的方案」。
 * 复杂度 O(n log D)，避免在 20 站场景下对数万个指标组合做两两比较。
 */
function nondominatedCells(cells: MetricCell[]): MetricCell[] {
  const sorted = cells.slice().sort(
    (a, b) =>
      a.cost - b.cost ||
      b.coverage - a.coverage ||
      b.highRiskCoverage - a.highRiskCoverage,
  );

  const maxCoverage = sorted.reduce((max, cell) => Math.max(max, cell.coverage), 0);
  const tree = new Int32Array(maxCoverage + 2).fill(-1);
  const queryFrom = (coverage: number): number => {
    // 后缀最大值树：索引取反，查询 coverage..maxCoverage 的最大高风险覆盖。
    const idx = maxCoverage - coverage + 1;
    let best = -1;
    for (let i = idx; i > 0; i -= i & -i) best = Math.max(best, tree[i]);
    return best;
  };
  const update = (coverage: number, value: number) => {
    const idx = maxCoverage - coverage + 1;
    for (let i = idx; i < tree.length; i += i & -i) tree[i] = Math.max(tree[i], value);
  };

  const frontier: MetricCell[] = [];
  for (const cell of sorted) {
    const best = queryFrom(cell.coverage);
    if (best >= cell.highRiskCoverage) continue;
    frontier.push(cell);
    update(cell.coverage, cell.highRiskCoverage);
  }
  return frontier;
}

function buildSearchStats(
  prepared: PreparedData,
  lockedSiteIds: string[],
  leavesVisited: number,
  metricCells: number,
  elapsedMs: number,
): SearchStats {
  return {
    totalSites: prepared.data.sites.length,
    searchedSites: prepared.data.sites.length - lockedSiteIds.length,
    lockedSites: lockedSiteIds.length,
    combinations: 2 ** (prepared.data.sites.length - lockedSiteIds.length),
    leavesVisited,
    metricCells,
    elapsedMs,
    exhaustive: true,
  };
}

export function buildSearchSignature(input: SearchInput, requirements: Requirement[]): string {
  const minima = requirements.map((requirement) => `${requirement.group}:${requirement.min}`).join(',');
  const must = [...new Set(input.mustCheckDeviceIds)].sort().join(',');
  const locked = [...new Set(input.lockedSiteIds)].sort().join(',');
  const raw = `${input.data.sites.length}|${minima}|${must}|${locked}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `R${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function searchPlans(input: SearchInput): SearchResult {
  const prepared = prepareData(input.data);
  const started = now();
  const requirements = normalizeRequirements(prepared, input.requirements);
  const mustCheckIds = [...new Set(input.mustCheckDeviceIds)].filter((id) =>
    prepared.deviceById.has(id),
  );
  const lockedSiteIds = [...new Set(input.lockedSiteIds)].filter((id) => prepared.siteById.has(id));
  const lockedSet = new Set(lockedSiteIds);
  const signature = buildSearchSignature(input, requirements);

  const diagnostics = buildGroupDiagnostics(prepared, requirements);
  const structuralIssues = buildStructuralIssues(prepared, mustCheckIds, diagnostics);
  const base = {
    requirements,
    mustCheckDeviceIds: mustCheckIds,
    lockedSiteIds,
    signature,
    structuralIssues,
    groupDiagnostics: diagnostics,
    zeroCoverageDevices: prepared.data.devices.filter((device) =>
      prepared.zeroCoverageDeviceIds.includes(device.id),
    ),
  };

  const lockedSites = prepared.data.sites.filter((site) => lockedSet.has(site.id));
  const lockedCost = lockedSites.reduce((sum, site) => sum + site.cost, 0);

  if (structuralIssues.length > 0) {
    return {
      ...base,
      lockedCost,
      feasibleCount: 0,
      frontier: [],
      minCostPoint: null,
      minFeasibleCost: null,
      dominatedSamples: [],
      dominatedCombinationCount: 0,
      stats: buildSearchStats(prepared, lockedSiteIds, 0, 0, now() - started),
    };
  }

  let mustCheckMask = 0;
  for (const id of mustCheckIds) mustCheckMask |= 1 << prepared.deviceBit.get(id)!;

  let lockedUnion = 0;
  let lockedSiteCount = 0;
  let lockedAssigned = 0;
  let lockedSiteMask = 0;
  prepared.data.sites.forEach((site, index) => {
    if (!lockedSet.has(site.id)) return;
    lockedUnion |= prepared.siteDeviceMask[index];
    lockedAssigned += prepared.siteDeviceCount[index];
    lockedSiteCount += 1;
    lockedSiteMask |= 1 << index;
  });

  const remainingSites: number[] = [];
  prepared.data.sites.forEach((site, index) => {
    if (!lockedSet.has(site.id)) remainingSites.push(index);
  });

  const requirementMasks = requirements
    .filter((requirement) => requirement.min > 0)
    .map((requirement) => ({
      mask: prepared.groupMask.get(requirement.group)!,
      min: requirement.min,
    }));

  const cells = new Map<string, MetricCell>();
  let feasibleCount = 0;
  let leavesVisited = 0;

  const consider = (
    union: number,
    cost: number,
    assigned: number,
    siteCount: number,
    mask: number,
  ) => {
    if ((union & mustCheckMask) !== mustCheckMask) return;
    for (const requirement of requirementMasks) {
      if (popcount32(union & requirement.mask) < requirement.min) return;
    }
    const coverage = popcount32(union);
    const highRiskCoverage = popcount32(union & prepared.highRiskMask);
    const key = `${cost}|${coverage}|${highRiskCoverage}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { key, cost, coverage, highRiskCoverage, count: 0, variants: [] };
      cells.set(key, cell);
    }
    cell.count += 1;
    feasibleCount += 1;
    const variant: VariantLite = { mask, siteCount, assigned, duplicates: assigned - coverage };
    if (
      cell.variants.length < MAX_VARIANTS_PER_CELL ||
      compareVariants(variant, cell.variants[cell.variants.length - 1]) < 0
    ) {
      cell.variants.push(variant);
      cell.variants.sort(compareVariants);
      if (cell.variants.length > MAX_VARIANTS_PER_CELL) cell.variants.pop();
    }
  };

  const dfs = (
    index: number,
    union: number,
    cost: number,
    assigned: number,
    siteCount: number,
    mask: number,
  ) => {
    if (index === remainingSites.length) {
      leavesVisited += 1;
      consider(union, cost, assigned, siteCount, mask);
      return;
    }
    const siteIndex = remainingSites[index];
    dfs(
      index + 1,
      union | prepared.siteDeviceMask[siteIndex],
      cost + prepared.data.sites[siteIndex].cost,
      assigned + prepared.siteDeviceCount[siteIndex],
      siteCount + 1,
      mask | (1 << siteIndex),
    );
    dfs(index + 1, union, cost, assigned, siteCount, mask);
  };

  // 被锁定站点直接并入基础集合，只穷举剩余站点；锁定站自身的覆盖也计入去重覆盖。
  dfs(0, lockedUnion, lockedCost, lockedAssigned, lockedSiteCount, lockedSiteMask);

  const allCells = [...cells.values()];
  const frontierCells = nondominatedCells(allCells);
  frontierCells.sort(
    (a, b) =>
      a.cost - b.cost ||
      b.coverage - a.coverage ||
      b.highRiskCoverage - a.highRiskCoverage,
  );

  const frontier: FrontierPoint[] = frontierCells.map((cell, index) => {
    const variants = cell.variants.map((variant) =>
      toPlanVariant(prepared, cell, variant, requirements),
    );
    return {
      cost: cell.cost,
      coverage: cell.coverage,
      highRiskCoverage: cell.highRiskCoverage,
      key: cell.key,
      id: `P${String(index + 1).padStart(2, '0')}`,
      variantCount: cell.count,
      variants,
      representative: variants[0],
      hiddenVariantCount: Math.max(0, cell.count - variants.length),
    };
  });

  const frontierKeys = new Set(frontierCells.map((cell) => cell.key));
  const dominatedCells = allCells
    .filter((cell) => !frontierKeys.has(cell.key))
    .sort(
      (a, b) =>
        a.cost - b.cost ||
        b.coverage - a.coverage ||
        b.highRiskCoverage - a.highRiskCoverage,
    );
  const dominatedCombinationCount = dominatedCells.reduce((sum, cell) => sum + cell.count, 0);

  const findWitness = (cell: MetricCell) => {
    const candidates = frontier.filter(
      (point) =>
        point.cost <= cell.cost &&
        point.coverage >= cell.coverage &&
        point.highRiskCoverage >= cell.highRiskCoverage &&
        (point.cost < cell.cost ||
          point.coverage > cell.coverage ||
          point.highRiskCoverage > cell.highRiskCoverage),
    );
    const score = (point: PlanMetrics) =>
      (cell.cost - point.cost) / Math.max(1, cell.cost) +
      (cell.coverage - point.coverage) / Math.max(1, cell.coverage) +
      (cell.highRiskCoverage - point.highRiskCoverage) / Math.max(1, cell.highRiskCoverage);
    return candidates.sort(
      (a, b) =>
        score(a) - score(b) ||
        a.cost - b.cost ||
        b.coverage - a.coverage ||
        b.highRiskCoverage - a.highRiskCoverage,
    )[0];
  };

  const gapScore = (cell: MetricCell) => {
    const witness = findWitness(cell);
    if (!witness) return Number.POSITIVE_INFINITY;
    return (
      (cell.cost - witness.cost) / Math.max(1, cell.cost) +
      (cell.coverage - witness.coverage) / Math.max(1, cell.coverage) +
      (cell.highRiskCoverage - witness.highRiskCoverage) / Math.max(1, cell.highRiskCoverage)
    );
  };

  const dominatedSamples: DominatedSample[] = [];
  const picked = new Set<string>();
  const pickSample = (cell: MetricCell | undefined) => {
    if (!cell || picked.has(cell.key) || dominatedSamples.length >= MAX_DOMINATED_SAMPLES) return;
    const witness = findWitness(cell);
    if (!witness) return;
    const variant = cell.variants[0];
    const representative = toPlanVariant(prepared, cell, variant, requirements);
    picked.add(cell.key);
    dominatedSamples.push({
      cost: cell.cost,
      coverage: cell.coverage,
      highRiskCoverage: cell.highRiskCoverage,
      key: cell.key,
      id: `D${String(dominatedSamples.length + 1).padStart(2, '0')}`,
      variantCount: cell.count,
      representative,
      reason: buildDominanceReason(witness, witness.id, witness.key, cell),
    });
  };

  // 先给最容易误选的（最便宜、离前沿最近），再给重复覆盖最多的样本。
  const maxFrontierCost = frontier.length > 0 ? frontier[frontier.length - 1].cost : 0;
  const byCost = dominatedCells.slice(0, 3);
  const byCloseness = dominatedCells
    .slice()
    .sort((a, b) => gapScore(a) - gapScore(b) || a.cost - b.cost)
    .slice(0, 4);
  const byDuplicates = dominatedCells
    .filter((cell) => cell.cost <= maxFrontierCost)
    .slice()
    .sort((a, b) => b.variants[0].duplicates - a.variants[0].duplicates || a.cost - b.cost)
    .slice(0, 2);
  for (const cell of [...byCost, ...byCloseness, ...byDuplicates, ...dominatedCells]) {
    pickSample(cell);
  }

  const minCostPoint = frontier[0] ?? null;
  const stats = buildSearchStats(prepared, lockedSiteIds, leavesVisited, allCells.length, now() - started);

  return {
    ...base,
    lockedCost,
    feasibleCount,
    frontier,
    minCostPoint,
    minFeasibleCost: minCostPoint ? minCostPoint.cost : null,
    dominatedSamples,
    dominatedCombinationCount,
    stats,
  };
}

export interface BudgetView {
  withinBudget: FrontierPoint[];
  exited: FrontierPoint[];
  budgetShortfall: number | null;
}

/** 预算只是已算好前沿的筛选条件，不触发重新搜索，也不改变前沿集合。 */
export function plansWithinBudget(result: SearchResult, budget: number): BudgetView {
  const withinBudget: FrontierPoint[] = [];
  const exited: FrontierPoint[] = [];
  for (const point of result.frontier) {
    if (point.cost <= budget) withinBudget.push(point);
    else exited.push(point);
  }
  return {
    withinBudget,
    exited,
    budgetShortfall:
      result.minFeasibleCost !== null && result.minFeasibleCost > budget
        ? result.minFeasibleCost - budget
        : null,
  };
}

export type { PreparedData };
