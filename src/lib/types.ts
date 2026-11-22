export type GroupId =
  | 'transformer'
  | 'switchgear'
  | 'cable'
  | 'protection'
  | 'fire';

export interface DeviceGroup {
  id: GroupId;
  name: string;
  shortName: string;
  description: string;
}

export interface Device {
  id: string;
  name: string;
  group: GroupId;
  highRisk: boolean;
  /** 是否为必检设备；必检设备必须至少被一个选中站点覆盖。 */
  mustCheck: boolean;
  note?: string;
}

export interface Site {
  id: string;
  name: string;
  shortName: string;
  cost: number;
  problemTypes: string[];
  devices: string[];
}

export interface Requirement {
  group: GroupId;
  min: number;
}

export interface InspectionData {
  groups: DeviceGroup[];
  devices: Device[];
  sites: Site[];
  problemTypes: string[];
  /** 默认设备组最低覆盖量。 */
  defaultRequirements: Requirement[];
  /** 默认必检设备编号。 */
  defaultMustCheck: string[];
  defaultBudget: number;
  budgetRange: { min: number; max: number; step: number };
}

export interface PlanMetrics {
  cost: number;
  /** 去重后的设备覆盖数（并集，不是各站覆盖数之和）。 */
  coverage: number;
  /** 去重后的高风险设备覆盖数。 */
  highRiskCoverage: number;
}

export interface PlanVariant {
  /** 对原始站点数组的位掩码，包含被锁定站点。 */
  mask: number;
  metrics: PlanMetrics;
  siteCount: number;
  /** 各站覆盖数之和。 */
  assigned: number;
  /** assigned - coverage。 */
  duplicates: number;
  siteIds: string[];
  detail: PlanDetail;
}

export interface FrontierPoint extends PlanMetrics {
  /** 由三项指标构成的稳定键，预算变化时不变。 */
  key: string;
  /** 形如 P01 的展示编号，按费用升序分配。 */
  id: string;
  /** 同指标组合的可行站点组合总数。 */
  variantCount: number;
  /** 重复覆盖最少的前若干个真实组合。 */
  variants: PlanVariant[];
  /** 展示用代表组合（variants[0]）。 */
  representative: PlanVariant;
  /** 该指标组合被截断展示的组合数。 */
  hiddenVariantCount: number;
}

export interface GroupDiagnostic {
  groupId: GroupId;
  groupName: string;
  totalDevices: number;
  coverableDevices: number;
  minRequired: number;
  structurallyImpossible: boolean;
  zeroCoverageDevices: Device[];
}

export interface StructuralIssue {
  kind: 'uncoverable-must-check' | 'group-min-above-coverable';
  groupId?: GroupId;
  title: string;
  message: string;
  deviceIds: string[];
  deviceNames: string[];
}

export interface PlanSiteRow {
  site: Site;
  /** 该站新增覆盖的设备数。 */
  added: number;
  /** 该站与已选站点重复覆盖的设备数。 */
  duplicate: number;
  addedDeviceIds: string[];
  duplicateDeviceIds: string[];
}

export interface GroupCoverageRow {
  group: DeviceGroup;
  covered: number;
  total: number;
  min: number;
  met: boolean;
  missedDeviceIds: string[];
}

export interface PlanDetail {
  mask: number;
  metrics: PlanMetrics;
  siteIds: string[];
  sites: Site[];
  siteCount: number;
  /** 各站覆盖数之和，仅用于对账展示。 */
  assigned: number;
  duplicates: number;
  duplicateRate: number;
  perSite: PlanSiteRow[];
  coveredDeviceIds: string[];
  missedDeviceIds: string[];
  coveredHighRiskDeviceIds: string[];
  missedHighRiskDeviceIds: string[];
  groupCoverage: GroupCoverageRow[];
  problemTypes: string[];
  /** 未覆盖且没有任何候选站点的设备编号。 */
  uncoverableDeviceIds: string[];
}

export interface DominanceReason {
  /** 支配方案的前沿编号。 */
  witnessId: string;
  witnessKey: string;
  witness: PlanMetrics;
  /** 逐项对比说明，例如「费用低 ¥6」。 */
  clauses: string[];
  summary: string;
}

export interface DominatedSample extends PlanMetrics {
  key: string;
  id: string;
  variantCount: number;
  representative: PlanVariant;
  reason: DominanceReason;
}

export interface SearchInput {
  data: InspectionData;
  requirements: Requirement[];
  mustCheckDeviceIds: string[];
  lockedSiteIds: string[];
}

export interface SearchStats {
  totalSites: number;
  searchedSites: number;
  lockedSites: number;
  combinations: number;
  leavesVisited: number;
  /** 不同（费用, 去重覆盖, 高风险覆盖）指标组合数。 */
  metricCells: number;
  elapsedMs: number;
  exhaustive: boolean;
}

export interface SearchResult {
  requirements: Requirement[];
  mustCheckDeviceIds: string[];
  lockedSiteIds: string[];
  /** 搜索结果指纹，形如 R1A2B3C4D；明细与汇总均引用同一次搜索。 */
  signature: string;
  lockedCost: number;
  /** 满足设备组最低覆盖、必检设备与锁定约束的站点组合总数（与预算无关）。 */
  feasibleCount: number;
  /** 全部非支配方案；预算变化不会改变该集合。 */
  frontier: FrontierPoint[];
  /** 前沿中费用最低者。 */
  minCostPoint: FrontierPoint | null;
  /** 满足约束所需的最低费用；结构性不可行时为 null。 */
  minFeasibleCost: number | null;
  structuralIssues: StructuralIssue[];
  groupDiagnostics: GroupDiagnostic[];
  /** 没有任何候选站点的设备（不论是否必检）。 */
  zeroCoverageDevices: Device[];
  /** 可行但被支配的抽样方案。 */
  dominatedSamples: DominatedSample[];
  /** 被支配的可行站点组合总数（与预算无关）。 */
  dominatedCombinationCount: number;
  stats: SearchStats;
}
