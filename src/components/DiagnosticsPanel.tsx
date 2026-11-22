import { money } from '../lib/format';
import type { Device, SearchResult } from '../lib/types';
import { Icon } from './ui';

export function DiagnosticsPanel({
  result,
  budget,
  onResetRequirements,
  onResetMustCheck,
}: {
  result: SearchResult;
  budget: number;
  onResetRequirements: () => void;
  onResetMustCheck: () => void;
}) {
  const uncoverableMustCheck = result.structuralIssues.find(
    (issue) => issue.kind === 'uncoverable-must-check',
  );
  const groupIssues = result.structuralIssues.filter(
    (issue) => issue.kind === 'group-min-above-coverable',
  );
  const budgetShort = result.minFeasibleCost !== null && result.minFeasibleCost > budget;

  return (
    <div className="diagnostics">
      <section className="card diagnostic-card" role="alert" aria-label="约束不可行">
        <div className="diagnostic-head">
          <span className="diagnostic-icon" aria-hidden>
            <Icon name="alert" size={20} />
          </span>
          <div>
            <h3>当前约束没有可行方案</h3>
            <p>搜索已穷举全部站点组合，没有任何组合同时满足必检设备与设备组最低覆盖量。</p>
          </div>
        </div>

        {uncoverableMustCheck ? (
          <div className="diagnostic-block">
            <h4>
              <Icon name="pin" size={14} /> 必检设备没有任何候选站点
            </h4>
            <p>{uncoverableMustCheck.message}</p>
            <div className="chips">
              {uncoverableMustCheck.deviceIds.map((id) => {
                const device = result.zeroCoverageDevices.find((item) => item.id === id);
                return (
                  <span key={id} className="chip chip-uncoverable">
                    <Icon name="x" size={11} />
                    {device?.name ?? id}
                    <span className="chip-flag">{id}</span>
                  </span>
                );
              })}
            </div>
            <p className="diagnostic-hint">
              处理方式：把该设备从必检集合中移除，或为它增加一个候选站点。
              <button type="button" className="link-button" onClick={onResetMustCheck}>
                恢复默认必检集合
              </button>
            </p>
          </div>
        ) : null}

        {groupIssues.length > 0 ? (
          <div className="diagnostic-block">
            <h4>
              <Icon name="alert" size={14} /> 设备组最低覆盖量超过可覆盖设备数
            </h4>
            <ul className="diagnostic-list">
              {groupIssues.map((issue) => (
                <li key={`${issue.groupId}`}>
                  <strong>{issue.title}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
            <p className="diagnostic-hint">
              处理方式：调低该组的最低覆盖量，或补充覆盖缺失设备的候选站点。
              <button type="button" className="link-button" onClick={onResetRequirements}>
                恢复默认最低覆盖量
              </button>
            </p>
          </div>
        ) : null}
      </section>

      {budgetShort ? (
        <section className="card diagnostic-card diagnostic-budget" role="status">
          <div className="diagnostic-head">
            <span className="diagnostic-icon" aria-hidden>
              <Icon name="info" size={20} />
            </span>
            <div>
              <h3>最低可行费用已超过预算</h3>
              <p>
                满足当前约束的最低费用为 <strong>{money(result.minFeasibleCost ?? 0)}</strong>，
                预算为 <strong>{money(budget)}</strong>，还差{' '}
                <strong>{money((result.minFeasibleCost ?? 0) - budget)}</strong>。这不是约束不可行，
                而是预算不足；提高预算即可看到前沿。
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card diagnostic-card" aria-label="无候选站点的设备">
        <div className="card-head">
          <h3 className="card-title">始终无法覆盖的设备</h3>
          <span className="card-sub">{result.zeroCoverageDevices.length} 台</span>
        </div>
        <p className="card-sub">
          这些设备不在任何候选站点的清单中，无论选择哪些站点都会漏掉。它们不计入可行性的硬约束（除非设为必检）。
        </p>
        <ul className="orphan-list">
          {result.zeroCoverageDevices.map((device) => (
            <li key={device.id}>
              <span className="chip chip-uncoverable">
                {device.name}
                <span className="chip-flag">{groupName(result, device)}</span>
              </span>
              {device.note ? <span className="muted">{device.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card diagnostic-card" aria-label="设备组覆盖诊断">
        <div className="card-head">
          <h3 className="card-title">设备组可覆盖性</h3>
        </div>
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col">设备组</th>
              <th scope="col">设备总数</th>
              <th scope="col">可覆盖</th>
              <th scope="col">最低要求</th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {result.groupDiagnostics.map((diagnostic) => (
              <tr key={diagnostic.groupId} className={diagnostic.structurallyImpossible ? 'row-bad' : ''}>
                <th scope="row">{diagnostic.groupName}</th>
                <td>{diagnostic.totalDevices}</td>
                <td>{diagnostic.coverableDevices}</td>
                <td>{diagnostic.minRequired}</td>
                <td>{diagnostic.structurallyImpossible ? '无法满足' : '可行'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function groupName(result: SearchResult, device: Device): string {
  const group = result.groupDiagnostics.find((diagnostic) => diagnostic.groupId === device.group);
  return group?.groupName ?? device.group;
}
