import type { Device, DeviceGroup, GroupId, InspectionData, Site } from './types';

/** 设备位图使用 30 位；再大就不能在 32 位位运算里精确表示。 */
export const MAX_DEVICES = 30;
/** 站点位图同样使用 30 位；精确搜索上限 20 个站点。 */
export const MAX_SITES_EXACT = 20;

export interface PreparedData {
  data: InspectionData;
  deviceById: Map<string, Device>;
  siteById: Map<string, Site>;
  groupById: Map<GroupId, DeviceGroup>;
  deviceBit: Map<string, number>;
  siteBit: Map<string, number>;
  allDevicesMask: number;
  highRiskMask: number;
  highRiskCount: number;
  mustCheckMask: number;
  groupMask: Map<GroupId, number>;
  groupDevices: Map<GroupId, Device[]>;
  siteDeviceMask: number[];
  siteDeviceCount: number[];
  siteDeviceIds: string[][];
  allCoveredMask: number;
  zeroCoverageDeviceIds: string[];
  siteProblemTypeUnion: string[];
}

const preparedCache = new WeakMap<InspectionData, PreparedData>();

export function popcount32(value: number): number {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

function fail(message: string): never {
  throw new Error(message);
}

export function prepareData(data: InspectionData): PreparedData {
  const cached = preparedCache.get(data);
  if (cached) return cached;

  if (data.devices.length > MAX_DEVICES) {
    fail(`设备数量 ${data.devices.length} 超过精确搜索上限 ${MAX_DEVICES} 台；请拆分设备清单后再分析。`);
  }
  if (data.sites.length > MAX_SITES_EXACT) {
    fail(
      `候选站点 ${data.sites.length} 个，超过精确搜索上限 ${MAX_SITES_EXACT} 个；请先按区域分组再分析。`,
    );
  }

  const deviceById = new Map<string, Device>();
  const deviceBit = new Map<string, number>();
  data.devices.forEach((device, index) => {
    if (deviceById.has(device.id)) fail(`设备编号重复：${device.id}`);
    deviceById.set(device.id, device);
    deviceBit.set(device.id, index);
  });

  const siteById = new Map<string, Site>();
  data.sites.forEach((site) => {
    if (siteById.has(site.id)) fail(`站点编号重复：${site.id}`);
    siteById.set(site.id, site);
  });

  const groupById = new Map<GroupId, DeviceGroup>();
  data.groups.forEach((group) => groupById.set(group.id, group));

  const groupMask = new Map<GroupId, number>();
  const groupDevices = new Map<GroupId, Device[]>();
  data.groups.forEach((group) => {
    groupMask.set(group.id, 0);
    groupDevices.set(group.id, []);
  });

  let allDevicesMask = 0;
  let highRiskMask = 0;
  let mustCheckMask = 0;
  data.devices.forEach((device) => {
    if (!groupById.has(device.group)) fail(`设备 ${device.id} 引用了未知设备组 ${device.group}`);
    const bit = 1 << deviceBit.get(device.id)!;
    allDevicesMask |= bit;
    if (device.highRisk) highRiskMask |= bit;
    if (device.mustCheck) mustCheckMask |= bit;
    groupMask.set(device.group, (groupMask.get(device.group) ?? 0) | bit);
    groupDevices.get(device.group)!.push(device);
  });

  const siteDeviceMask: number[] = [];
  const siteDeviceCount: number[] = [];
  const siteDeviceIds: string[][] = [];
  let allCoveredMask = 0;

  data.sites.forEach((site) => {
    let mask = 0;
    const seen = new Set<string>();
    for (const deviceId of site.devices) {
      const device = deviceById.get(deviceId);
      if (!device) fail(`站点 ${site.id} 引用了不存在的设备 ${deviceId}`);
      if (seen.has(deviceId)) continue;
      seen.add(deviceId);
      mask |= 1 << deviceBit.get(deviceId)!;
    }
    siteDeviceMask.push(mask);
    siteDeviceCount.push(seen.size);
    siteDeviceIds.push([...seen]);
    allCoveredMask |= mask;
  });

  const zeroCoverageDeviceIds = data.devices
    .filter((device) => (allCoveredMask & (1 << deviceBit.get(device.id)!)) === 0)
    .map((device) => device.id);

  const problemSet = new Set<string>();
  data.sites.forEach((site) => site.problemTypes.forEach((type) => problemSet.add(type)));
  const siteProblemTypeUnion = data.problemTypes.filter((type) => problemSet.has(type));

  const prepared: PreparedData = {
    data,
    deviceById,
    siteById,
    groupById,
    deviceBit,
    siteBit: new Map(data.sites.map((site, index) => [site.id, 1 << index])),
    allDevicesMask,
    highRiskMask,
    highRiskCount: popcount32(highRiskMask),
    mustCheckMask,
    groupMask,
    groupDevices,
    siteDeviceMask,
    siteDeviceCount,
    siteDeviceIds,
    allCoveredMask,
    zeroCoverageDeviceIds,
    siteProblemTypeUnion,
  };
  preparedCache.set(data, prepared);
  return prepared;
}

export function maskToDeviceIds(prepared: PreparedData, mask: number): string[] {
  return prepared.data.devices
    .filter((device) => (mask & (1 << prepared.deviceBit.get(device.id)!)) !== 0)
    .map((device) => device.id);
}
