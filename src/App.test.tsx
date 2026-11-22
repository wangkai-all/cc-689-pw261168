import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

beforeEach(() => {
  localStorage.clear();
});

function selectScenario(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('页面交互与搜索结果同源', () => {
  it('默认选中预算内最低费用方案，明细与汇总指标一致', () => {
    const { container } = render(<App />);
    const detail = screen.getByRole('region', { name: '方案明细' });
    expect(within(detail).getByText('P01')).toBeInTheDocument();
    // 前沿编号数量 = 统计卡上的前沿方案数。
    expect(container.querySelectorAll('.point-hit')).toHaveLength(
      Number(screen.getByText('前沿方案').nextElementSibling?.textContent?.replace(/\D/g, '')),
    );
  });

  it('点击另一个方案后，明细切换到该方案', () => {
    const { container } = render(<App />);
    const hits = container.querySelectorAll('.point-hit');
    fireEvent.click(hits[hits.length - 1]);
    const detail = screen.getByRole('region', { name: '方案明细' });
    expect(within(detail).getByText(/^P\d{2}$/)).toBeInTheDocument();
    expect(within(detail).getByText(/^P\d{2}$/).textContent).not.toBe('P01');
  });

  it('调低预算后方案退出可行范围，并给出最低可行费用的差额', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('拖动预算'), { target: { value: '20' } });
    expect(screen.getByText(/预算内没有可行方案/)).toBeInTheDocument();
    expect(screen.getByText(/还差 ¥13/)).toBeInTheDocument();
    const tray = screen.getByText('已退出可行范围').closest('.exited-tray');
    expect(tray).not.toBeNull();
    expect(tray!.querySelectorAll('.exited-chip').length).toBeGreaterThan(0);
  });

  it('锁定一站后只搜索剩余站点，锁定站计入费用', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '锁定 南湖巡检队' }));
    expect(screen.getAllByText(/锁定 1 站/).length).toBeGreaterThan(0);
    expect(screen.getByText(/14 站穷举/)).toBeInTheDocument();
    expect(screen.getByText(/含锁定站 ¥19/)).toBeInTheDocument();
    const detail = screen.getByRole('region', { name: '方案明细' });
    expect(within(detail).getAllByText('ST-E').length).toBeGreaterThan(0);
    expect(within(detail).getByText('锁定')).toBeInTheDocument();
  });

  it('必检设备无候选站时直接判定不可行并点名该设备', () => {
    render(<App />);
    selectScenario(/孤立必检设备/);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/当前约束没有可行方案/)).toBeInTheDocument();
    expect(within(alert).getAllByText(/消防水池液位计/).length).toBeGreaterThan(0);
    expect(within(alert).getByText(/没有任何候选站点/)).toBeInTheDocument();
  });

  it('提高最低覆盖后前沿收缩，最低可行费用上升', () => {
    const { container } = render(<App />);
    const before = container.querySelectorAll('.point-hit').length;
    selectScenario(/提高最低覆盖/);
    const after = container.querySelectorAll('.point-hit').length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(screen.getByText(/最低可行费用/).nextElementSibling?.textContent).toContain('¥60');
  });
});
