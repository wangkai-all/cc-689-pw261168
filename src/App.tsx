import { useEffect, useMemo, useState } from 'react';
import { inspectionData } from './data/inspection';
import { prepareData } from './lib/coverage';
import { plansWithinBudget, searchPlans } from './lib/search';
import { clamp, money } from './lib/format';
import type { GroupId, PlanVariant, Requirement, SearchResult } from './lib/types';
import { ConstraintPanel, type ScenarioId, type ScenarioState } from './components/ConstraintPanel';
import { FrontierChart } from './components/FrontierChart';
import { PlanDetailPanel } from './components/PlanDetailPanel';
import { DominancePanel } from './components/DominancePanel';
import { SitesPanel } from './components/SitesPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { Icon, StatTile, StatusChip } from './components/ui';

const prepared = prepareData(inspectionData);
const STORAGE_KEY = 'inspection-plan-state-v1';

interface PersistedState {
  requirements: Requirement[];
  mustCheck: string[];
  locks: string[];
  budget: number;
  selectedKey: string;
}

function loadState(): PersistedState {
  const fallback: PersistedState = {
    requirements: inspectionData.defaultRequirements,
    mustCheck: inspectionData.defaultMustCheck,
    locks: [],
    budget: inspectionData.defaultBudget,
    selectedKey: '',
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : fallback.requirements,
      mustCheck: Array.isArray(parsed.mustCheck) ? parsed.mustCheck : fallback.mustCheck,
      locks: Array.isArray(parsed.locks) ? parsed.locks : [],
      budget: typeof parsed.budget === 'number' ? parsed.budget : fallback.budget,
      selectedKey: typeof parsed.selectedKey === 'string' ? parsed.selectedKey : '',
    };
  } catch {
    return fallback;
  }
}

function sameMins(a: Requirement[], b: Requirement[]): boolean {
  return a.length === b.length && a.every((item, index) => item.min === b[index]?.min);
}

export default function App() {
  const [requirements, setRequirements] = useState<Requirement[]>(loadState().requirements);
  const [mustCheck, setMustCheck] = useState<string[]>(loadState().mustCheck);
  const [locks, setLocks] = useState<string[]>(loadState().locks);
  const [budget, setBudget] = useState<number>(loadState().budget);
  const [selectedKey, setSelectedKey] = useState<string>(loadState().selectedKey);
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [scenario, setScenario] = useState<ScenarioState>('default');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ requirements, mustCheck, locks, budget, selectedKey }),
        );
      } catch {
        /* 存储不可用时静默降级 */
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [requirements, mustCheck, locks, budget, selectedKey]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const result: SearchResult = useMemo(
    () =>
      searchPlans({
        data: inspectionData,
        requirements,
        mustCheckDeviceIds: mustCheck,
        lockedSiteIds: locks,
      }),
    [requirements, mustCheck, locks],
  );

  const budgetView = useMemo(() => plansWithinBudget(result, budget), [result, budget]);

  // 预算内默认选中费用最低的前沿方案；用户点选后保持其 key。
  const selectedPoint = useMemo(() => {
    const found = result.frontier.find((point) => point.key === selectedKey);
    if (found) return found;
    return budgetView.withinBudget[0] ?? null;
  }, [result.frontier, selectedKey, budgetView.withinBudget]);

  useEffect(() => {
    if (selectedPoint && selectedPoint.key !== selectedKey) setSelectedKey(selectedPoint.key);
  }, [selectedPoint, selectedKey]);

  const [variantIndex, setVariantIndex] = useState(0);
  useEffect(() => {
    setVariantIndex(0);
  }, [selectedPoint?.key]);

  const activeVariant: PlanVariant | null =
    selectedPoint?.variants[Math.min(variantIndex, selectedPoint.variants.length - 1)] ?? null;

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [compareWitness, setCompareWitness] = useState<string | null>(null);

  const updateRequirement = (group: GroupId, min: number) => {
    setScenario('custom');
    setRequirements((current) =>
      current.map((item) => (item.group === group ? { ...item, min: clamp(min, 0, 30) } : item)),
    );
  };

  const toggleMustCheck = (deviceId: string) => {
    setScenario('custom');
    setMustCheck((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId],
    );
  };

  const toggleLock = (siteId: string) => {
    setScenario('custom');
    setLocks((current) =>
      current.includes(siteId) ? current.filter((id) => id !== siteId) : [...current, siteId],
    );
  };

  const applyScenario = (id: ScenarioId) => {
    setScenario(id);
    setSelectedKey('');
    if (id === 'tight') {
      setRequirements([
        { group: 'transformer', min: 5 },
        { group: 'switchgear', min: 5 },
        { group: 'cable', min: 4 },
        { group: 'protection', min: 6 },
        { group: 'fire', min: 4 },
      ]);
      setMustCheck(inspectionData.defaultMustCheck);
      setLocks([]);
      setBudget(80);
      return;
    }
    if (id === 'orphan') {
      setRequirements(inspectionData.defaultRequirements);
      setMustCheck([...inspectionData.defaultMustCheck, 'F6']);
      setLocks([]);
      setBudget(80);
      return;
    }
    if (id === 'lock') {
      setRequirements(inspectionData.defaultRequirements);
      setMustCheck(inspectionData.defaultMustCheck);
      setLocks(['ST-E']);
      setBudget(60);
      return;
    }
    setRequirements(inspectionData.defaultRequirements);
    setMustCheck(inspectionData.defaultMustCheck);
    setLocks([]);
    setBudget(inspectionData.defaultBudget);
  };

  const resetAll = () => {
    applyScenario('default');
  };

  const infeasible = result.frontier.length === 0;
  const budgetBlocked = !infeasible && budgetView.withinBudget.length === 0;
  const defaultMins = sameMins(requirements, inspectionData.defaultRequirements);

  const maxHighRisk = prepared.highRiskCount;
  const totalDevices = inspectionData.devices.length;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <GraphGlyph />
          </div>
          <div>
            <div className="brand-eyebrow">虚构样本 · 巡维规划</div>
            <h1 className="brand-title">巡检方案分析</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="meta-pill">
            {inspectionData.sites.length} 个候选站点 · {totalDevices} 台设备
          </span>
          <div className="theme-toggle" role="group" aria-label="配色模式">
            {(['auto', 'light', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={theme === mode ? 'active' : ''}
                onClick={() => setTheme(mode)}
                aria-pressed={theme === mode}
              >
                {mode === 'auto' ? '跟随系统' : mode === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main id="main" className="layout">
        <aside className="sidebar" aria-label="约束与候选站点">
          <ConstraintPanel
            groups={inspectionData.groups}
            groupDiagnostics={result.groupDiagnostics}
            requirements={requirements}
            onChangeRequirement={updateRequirement}
            onResetRequirements={() => setRequirements(inspectionData.defaultRequirements)}
            requirementsAreDefault={defaultMins}
            devices={inspectionData.devices}
            mustCheck={mustCheck}
            onToggleMustCheck={toggleMustCheck}
            onResetMustCheck={() => setMustCheck(inspectionData.defaultMustCheck)}
            locks={locks}
            onClearLocks={() => setLocks([])}
            scenario={scenario}
            onScenario={applyScenario}
          />
          <SitesPanel
            sites={inspectionData.sites}
            prepared={prepared}
            locks={locks}
            onToggleLock={toggleLock}
            selectedSiteIds={activeVariant?.detail.siteIds ?? []}
          />
        </aside>

        <section className="content">
          <div className="content-head">
            <div>
              <div className="section-eyebrow">
                搜索结果 <code>{result.signature}</code>
                <span className="search-scope">
                  {result.stats.searchedSites} 站穷举 ·{' '}
                  {result.stats.combinations.toLocaleString('zh-CN')} 种组合
                  {result.stats.lockedSites > 0 ? ` · 锁定 ${result.stats.lockedSites} 站` : ''}
                </span>
              </div>
              <h2 className="section-title">预算内的非支配方案</h2>
              <p className="section-lede">
                费用、去重覆盖、高风险覆盖三项互不占优的方案构成前沿。预算只筛选前沿，不重新搜索。
              </p>
            </div>
            <button type="button" className="ghost-button" onClick={resetAll}>
              重置全部
            </button>
          </div>

          {infeasible ? (
            <DiagnosticsPanel
              result={result}
              budget={budget}
              onResetRequirements={() => setRequirements(inspectionData.defaultRequirements)}
              onResetMustCheck={() => setMustCheck(inspectionData.defaultMustCheck)}
            />
          ) : (
            <>
              <div className="stat-row">
                <StatTile
                  label="前沿方案"
                  value={String(result.frontier.length).padStart(2, '0')}
                  unit="组"
                  note={`${result.feasibleCount.toLocaleString('zh-CN')} 个可行组合归并为 ${result.stats.metricCells.toLocaleString('zh-CN')} 个指标组合`}
                />
                <StatTile
                  label="预算内可选"
                  value={String(budgetView.withinBudget.length).padStart(2, '0')}
                  unit="组"
                  tone={budgetBlocked ? 'critical' : 'accent'}
                  note={`预算 ${money(budget)} · 超预算 ${budgetView.exited.length} 组`}
                />
                <StatTile
                  label="最低可行费用"
                  value={money(result.minFeasibleCost ?? 0)}
                  note={
                    result.lockedCost > 0
                      ? `含锁定站 ${money(result.lockedCost)}`
                      : `穷举 ${result.stats.leavesVisited.toLocaleString('zh-CN')} 个叶子`
                  }
                />
                <StatTile
                  label="被支配的组合"
                  value={result.dominatedCombinationCount.toLocaleString('zh-CN')}
                  note="可被前沿中的某组方案在三项指标上同时不差地替代"
                />
              </div>

              {budgetBlocked ? (
                <div className="banner banner-warning" role="status">
                  <Icon name="alert" />
                  <div>
                    <strong>预算内没有可行方案。</strong>
                    最低可行费用 {money(result.minFeasibleCost ?? 0)}，当前预算 {money(budget)}
                    {budgetView.budgetShortfall !== null
                      ? `，还差 ${money(budgetView.budgetShortfall)}。`
                      : '。'}
                    下方仍展示全部前沿，可拖动预算或放宽约束。
                  </div>
                </div>
              ) : null}

              <FrontierChart
                result={result}
                budget={budget}
                onBudgetChange={setBudget}
                selectedKey={selectedPoint?.key ?? null}
                onSelect={setSelectedKey}
                hoverKey={hoverKey}
                onHover={setHoverKey}
                maxHighRisk={maxHighRisk}
                coverageCeiling={totalDevices}
                budgetRange={inspectionData.budgetRange}
              />

              <div className="detail-grid">
                <PlanDetailPanel
                  result={result}
                  point={selectedPoint}
                  variant={activeVariant}
                  variantIndex={variantIndex}
                  onVariantChange={setVariantIndex}
                  onLockSite={toggleLock}
                  lockedSiteIds={locks}
                  budget={budget}
                  prepared={prepared}
                  onCompare={(witnessId) => setCompareWitness(witnessId)}
                />
                <DominancePanel
                  result={result}
                  budget={budget}
                  compareWitness={compareWitness}
                  onSelectKey={(key) => setSelectedKey(key)}
                  hoverKey={hoverKey}
                  onHover={setHoverKey}
                  maxHighRisk={maxHighRisk}
                />
              </div>

              <section className="card method-card" aria-label="计算口径">
                <div className="card-head">
                  <h3 className="card-title">计算口径与覆盖集合</h3>
                  <StatusChip tone="accent">同一次搜索结果</StatusChip>
                </div>
                <div className="method-grid">
                  <div>
                    <h4>1 · 先建覆盖集合</h4>
                    <p>
                      每个站点映射为一个设备位图，方案覆盖为所有选中站点位图的按位并集，
                      因此同一台设备只会被计一次。汇总中的覆盖量与明细中的设备清单都从同一个位图得出。
                    </p>
                  </div>
                  <div>
                    <h4>2 · 再穷举站点组合</h4>
                    <p>
                      {result.stats.lockedSites > 0
                        ? `锁定 ${result.stats.lockedSites} 站后只穷举剩余 ${result.stats.searchedSites} 站`
                        : `对 ${result.stats.searchedSites} 个站点做 2^${result.stats.searchedSites} 精确穷举`}
                      ，逐一检查必检设备与各组最低覆盖量，共访问{' '}
                      {result.stats.leavesVisited.toLocaleString('zh-CN')} 个叶子节点、耗时{' '}
                      {result.stats.elapsedMs < 1 ? '<1' : result.stats.elapsedMs.toFixed(0)} ms。
                    </p>
                  </div>
                  <div>
                    <h4>3 · 三维非支配筛选</h4>
                    <p>
                      只有一个方案在费用不更高、覆盖不更少、高风险覆盖也不更少，且至少一项严格更优时，
                      才判定为支配。没有用权重打分近似前沿，也没有把各站覆盖数相加。
                    </p>
                  </div>
                </div>
              </section>

              <FrontierTable
                result={result}
                budget={budget}
                selectedKey={selectedPoint?.key ?? null}
                onSelect={setSelectedKey}
                onHover={setHoverKey}
                maxHighRisk={maxHighRisk}
              />

              <footer className="footnote">
                <p>
                  本页所有站点、费用与设备均为虚构演示数据，不对应任何真实现场。设备总数 {totalDevices}{' '}
                  台，其中无候选站点的设备 {result.zeroCoverageDevices.length} 台
                  {result.zeroCoverageDevices.length > 0
                    ? `（${result.zeroCoverageDevices.map((device) => device.name).join('、')}）`
                    : ''}
                  。精确搜索上限 {prepared.data.sites.length > 20 ? '' : '20'} 个候选站点、30 台设备。
                </p>
              </footer>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function FrontierTable({
  result,
  budget,
  selectedKey,
  onSelect,
  onHover,
  maxHighRisk,
}: {
  result: SearchResult;
  budget: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  maxHighRisk: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card table-card">
      <div className="card-head">
        <div>
          <h3 className="card-title">前沿数据表</h3>
          <p className="card-sub">与上方图表同源；可作为图表的无障碍替代视图。</p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? '收起表格' : '展开表格'}
        </button>
      </div>
      {open ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">编号</th>
                <th scope="col">费用</th>
                <th scope="col">覆盖</th>
                <th scope="col">高风险</th>
                <th scope="col">站点</th>
                <th scope="col">重复覆盖</th>
                <th scope="col">同指标组合</th>
                <th scope="col">预算</th>
              </tr>
            </thead>
            <tbody>
              {result.frontier.map((point) => (
                <tr
                  key={point.key}
                  className={point.key === selectedKey ? 'selected' : ''}
                  onClick={() => onSelect(point.key)}
                  onMouseEnter={() => onHover(point.key)}
                  onMouseLeave={() => onHover(null)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(point.key);
                    }
                  }}
                >
                  <th scope="row">{point.id}</th>
                  <td>{money(point.cost)}</td>
                  <td>
                    {point.coverage}/{totalDeviceLabel()}
                  </td>
                  <td>
                    {point.highRiskCoverage}/{maxHighRisk}
                  </td>
                  <td className="mono">{point.representative.siteIds.join(' · ')}</td>
                  <td>{point.representative.duplicates}</td>
                  <td>{point.variantCount}</td>
                  <td>{point.cost <= budget ? '在预算内' : '超预算'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="table-hint">默认收起，展开后与图表使用同一份 SearchResult。</p>
      )}
    </section>
  );
}

function totalDeviceLabel(): number {
  return inspectionData.devices.length;
}

function GraphGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 6.8 15.6 5.4M6.2 8l4.6 8.3M16.9 7.1l-3.5 9.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
