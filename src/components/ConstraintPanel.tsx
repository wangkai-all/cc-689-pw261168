import { useState } from 'react';
import type { Device, DeviceGroup, GroupDiagnostic, GroupId, Requirement } from '../lib/types';
import { Icon, Meter } from './ui';

export const SCENARIOS = [
  { id: 'default', name: '默认样本', description: '15 个候选站点 · 30 台设备，含 1 台无候选站' },
  { id: 'tight', name: '提高最低覆盖', description: '每组接近可覆盖上限，前沿收缩到 5 组' },
  { id: 'orphan', name: '孤立必检设备', description: '把无候选站的 F6 设为必检，直接不可行' },
  { id: 'lock', name: '锁定南湖站', description: '固定 ST-E 后只搜索剩余 14 站' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];
export type ScenarioState = ScenarioId | 'custom';

export function ConstraintPanel({
  groups,
  groupDiagnostics,
  requirements,
  onChangeRequirement,
  onResetRequirements,
  requirementsAreDefault,
  devices,
  mustCheck,
  onToggleMustCheck,
  onResetMustCheck,
  locks,
  onClearLocks,
  scenario,
  onScenario,
}: {
  groups: DeviceGroup[];
  groupDiagnostics: GroupDiagnostic[];
  requirements: Requirement[];
  onChangeRequirement: (group: GroupId, min: number) => void;
  onResetRequirements: () => void;
  requirementsAreDefault: boolean;
  devices: Device[];
  mustCheck: string[];
  onToggleMustCheck: (deviceId: string) => void;
  onResetMustCheck: () => void;
  locks: string[];
  onClearLocks: () => void;
  scenario: ScenarioState;
  onScenario: (scenario: ScenarioId) => void;
}) {
  const [openDevices, setOpenDevices] = useState(false);
  const mustCheckDevices = devices.filter((device) => mustCheck.includes(device.id));

  return (
    <section className="card constraint-card" aria-label="约束">
      <div className="card-head">
        <h2 className="card-title">约束</h2>
        {!requirementsAreDefault ? (
          <button type="button" className="text-button" onClick={onResetRequirements}>
            恢复默认
          </button>
        ) : null}
      </div>

      <div className="field-group">
        <div className="field-label-row">
          <div className="field-label">示例情形</div>
        </div>
        <p className="field-help">切换预置情形，观察前沿收缩、预算不足与结构性不可行三种状态。</p>
        <div className="scenario-list" role="group" aria-label="示例情形">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`scenario-button ${scenario === item.id ? 'active' : ''}`}
              onClick={() => onScenario(item.id)}
              aria-pressed={scenario === item.id}
            >
              <span className="scenario-name">{item.name}</span>
              <span className="scenario-desc">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <div className="field-label">设备组最低覆盖量</div>
        <p className="field-help">每组至少覆盖多少台设备；未达到则该方案不可行。</p>
        {groups.map((group) => {
          const requirement = requirements.find((item) => item.group === group.id)!;
          const diagnostic = groupDiagnostics.find((item) => item.groupId === group.id)!;
          return (
            <div key={group.id} className={`req-row ${diagnostic.structurallyImpossible ? 'req-impossible' : ''}`}>
              <div className="req-head">
                <label htmlFor={`req-${group.id}`}>{group.name}</label>
                <span className="req-meta">
                  可覆盖 {diagnostic.coverableDevices}/{diagnostic.totalDevices}
                </span>
              </div>
              <div className="req-controls">
                <input
                  id={`req-${group.id}`}
                  type="range"
                  min={0}
                  max={diagnostic.coverableDevices}
                  step={1}
                  value={Math.min(requirement.min, diagnostic.coverableDevices)}
                  style={{
                    ['--fill' as string]: `${(Math.min(requirement.min, diagnostic.coverableDevices) / Math.max(1, diagnostic.coverableDevices)) * 100}%`,
                  }}
                  onChange={(event) => onChangeRequirement(group.id, Number(event.target.value))}
                />
                <span className="req-value">{requirement.min}</span>
              </div>
              {diagnostic.structurallyImpossible ? (
                <div className="req-warning">
                  <Icon name="alert" size={12} /> 超过可覆盖设备数，无法满足
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="field-group">
        <div className="field-label-row">
          <div className="field-label">必检设备</div>
          <button
            type="button"
            className="text-button"
            onClick={() => setOpenDevices((value) => !value)}
            aria-expanded={openDevices}
          >
            {openDevices ? '收起' : '调整'}
          </button>
        </div>
        <p className="field-help">
          必检设备必须至少被一个选中站点覆盖；没有任何候选站点的必检设备会直接判定不可行。
        </p>
        <div className="chips">
          {mustCheckDevices.map((device) => {
            const uncovered = !groupDiagnostics.some((diagnostic) =>
              diagnostic.zeroCoverageDevices.some((item) => item.id === device.id),
            );
            return (
              <span key={device.id} className={`device-chip ${uncovered ? '' : 'device-chip-orphan'}`}>
                {device.name}
                {device.note ? <em>{device.note}</em> : null}
              </span>
            );
          })}
        </div>
        {openDevices ? (
          <div className="device-picker">
            {groups.map((group) => (
              <div key={group.id} className="device-picker-group">
                <div className="device-picker-title">{group.name}</div>
                <div className="device-picker-list">
                  {devices
                    .filter((device) => device.group === group.id)
                    .map((device) => {
                      const zerocov = groupDiagnostics
                        .find((diagnostic) => diagnostic.groupId === group.id)!
                        .zeroCoverageDevices.some((item) => item.id === device.id);
                      return (
                        <label key={device.id} className={`device-option ${zerocov ? 'orphan' : ''}`}>
                          <input
                            type="checkbox"
                            checked={mustCheck.includes(device.id)}
                            onChange={() => onToggleMustCheck(device.id)}
                          />
                          <span>{device.name}</span>
                          {device.highRisk ? <span className="tag tag-risk">高风险</span> : null}
                          {zerocov ? <span className="tag tag-orphan">无候选站</span> : null}
                        </label>
                      );
                    })}
                </div>
              </div>
            ))}
            <button type="button" className="text-button" onClick={onResetMustCheck}>
              恢复默认必检集合
            </button>
          </div>
        ) : null}
      </div>

      <div className="field-group lock-field">
        <div className="field-label-row">
          <div className="field-label">
            <Icon name="lock" size={13} /> 已锁定站点
          </div>
          {locks.length > 0 ? (
            <button type="button" className="text-button" onClick={onClearLocks}>
              全部解锁
            </button>
          ) : null}
        </div>
        {locks.length === 0 ? (
          <p className="field-help">未锁定。点击右侧站点列表中的锁图标，可固定一站后只搜索剩余站点。</p>
        ) : (
          <p className="field-help">
            已固定 {locks.length} 站，搜索只穷举剩余站点；锁定站的费用与覆盖始终计入。
          </p>
        )}
      </div>
    </section>
  );
}

export function CoverageMeters({
  diagnostics,
  requirements,
}: {
  diagnostics: GroupDiagnostic[];
  requirements: Requirement[];
}) {
  return (
    <div className="coverage-meters">
      {diagnostics.map((diagnostic) => {
        const requirement = requirements.find((item) => item.group === diagnostic.groupId)!;
        return (
          <Meter
            key={diagnostic.groupId}
            label={diagnostic.groupName}
            value={diagnostic.coverableDevices}
            total={diagnostic.totalDevices}
            min={requirement.min}
            meta={diagnostic.zeroCoverageDevices.length > 0 ? '含无候选站设备' : undefined}
          />
        );
      })}
    </div>
  );
}
