/**
 * 系统配置文件
 * 
 * 此文件用于配置系统的各项参数，包括剂量限制、安全锁定时间等。
 * 修改此文件后需要重启服务才能生效。
 */

export const SYSTEM_CONFIG = {
  // 剂量限制
  doseLimits: {
    // 最大胰岛素输注量（单位：U）
    maxInsulin: 25,
    // 最大碳水输注量（单位：g）
    maxCarbs: 150,
    // 最小胰岛素输注量（单位：U）
    minInsulin: 0.1,
    // 最小碳水输注量（单位：g）
    minCarbs: 1,
  },

  // 安全锁定时间（单位：分钟）
  safetyLock: {
    // 胰岛素输注后锁定时间
    insulinLockMinutes: 15,
    // 碳水输注后锁定时间
    carbsLockMinutes: 1,
  },

  // 命令有效期（单位：分钟）
  command: {
    // 命令有效期
    expiryMinutes: 5,
  },

  // 设备管理
  device: {
    // 心跳间隔（单位：秒）
    heartbeatIntervalSeconds: 30,
    // 离线判定时间（单位：秒）
    offlineThresholdSeconds: 60,
    // 命令轮询间隔（单位：秒）
    commandPollIntervalSeconds: 5,
  },

  // Nightscout
  nightscout: {
    // 请求超时时间（单位：毫秒）
    requestTimeoutMs: 10000,
    // 数据获取数量
    entriesCount: 288, // 24 小时数据（每 5 分钟一条）
    treatmentsCount: 50,
    statusCount: 1,
  },
} as const;

export type SystemConfig = typeof SYSTEM_CONFIG;
