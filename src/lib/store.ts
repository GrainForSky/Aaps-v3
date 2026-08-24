// ============================================
// AndroidAPS Remote Control - In-Memory Store
// ============================================

import {
  DeviceInfo,
  Command,
  User,
  SAFETY_RULES,
} from './types';

// 设备注册表
const devices = new Map<string, DeviceInfo>();

// 命令队列
const commands = new Map<string, Command>();

// 登录用户
const users = new Map<string, User>();

// 速率限制记录
const rateLimits = new Map<string, number[]>();

// ============================================
// 设备管理
// ============================================

export function registerDevice(
  phone: string,
  deviceId: string,
  appVersion: string
): { deviceToken: string; message: string } {
  const deviceToken = generateDeviceToken(phone, deviceId);
  const now = Date.now();

  devices.set(phone, {
    phone,
    deviceId,
    deviceToken,
    appVersion,
    lastHeartbeat: now,
    registeredAt: now,
  });

  return { deviceToken, message: `设备 ${deviceId} 注册成功` };
}

export function updateHeartbeat(
  phone: string,
  deviceId: string,
  deviceToken: string
): boolean {
  const device = devices.get(phone);
  if (!device) return false;
  if (device.deviceId !== deviceId) return false;
  if (device.deviceToken !== deviceToken) return false;

  device.lastHeartbeat = Date.now();
  return true;
}

export function getDevice(phone: string): DeviceInfo | undefined {
  return devices.get(phone);
}

export function isDeviceOnline(phone: string): boolean {
  const device = devices.get(phone);
  if (!device) return false;
  return Date.now() - device.lastHeartbeat < 60000;
}

export function getDeviceStatus(phone: string): 'online' | 'offline' | 'not_registered' {
  const device = devices.get(phone);
  if (!device) return 'not_registered';
  return isDeviceOnline(phone) ? 'online' : 'offline';
}

export function authenticateDevice(
  phone: string,
  deviceId: string,
  deviceToken: string
): boolean {
  const device = devices.get(phone);
  if (!device) return false;
  if (device.deviceId !== deviceId) return false;
  if (device.deviceToken !== deviceToken) return false;
  return true;
}

// ============================================
// 命令管理
// ============================================

export function createCommand(
  phone: string,
  type: 'bolus' | 'carbs',
  insulin?: number,
  carbs?: number
): Command {
  const now = Date.now();
  const command: Command = {
    id: generateCommandId(),
    phone,
    type,
    insulin,
    carbs,
    status: 'pending',
    createdAt: now,
    expiresAt: now + SAFETY_RULES.COMMAND_EXPIRY_MINUTES * 60 * 1000,
  };

  commands.set(command.id, command);
  return command;
}

export function getPendingCommands(phone: string): Command[] {
  const now = Date.now();
  const pending: Command[] = [];

  for (const cmd of commands.values()) {
    if (cmd.phone !== phone) continue;
    if (cmd.status !== 'pending') continue;
    if (now > cmd.expiresAt) {
      cmd.status = 'expired';
      continue;
    }
    pending.push(cmd);
  }

  return pending;
}

export function updateCommandStatus(
  commandId: string,
  phone: string,
  deviceId: string,
  deviceToken: string,
  success: boolean,
  message: string
): Command | null {
  const command = commands.get(commandId);
  if (!command) return null;
  if (command.phone !== phone) return null;

  // 验证设备身份
  const device = devices.get(phone);
  if (!device) return null;
  if (device.deviceId !== deviceId) return null;
  if (device.deviceToken !== deviceToken) return null;

  command.status = success ? 'completed' : 'failed';
  command.result = {
    success,
    message,
    executedAt: Date.now(),
  };

  return command;
}

export function getCommand(commandId: string, phone: string): Command | null {
  const command = commands.get(commandId);
  if (!command) return null;
  if (command.phone !== phone) return null;
  return command;
}

// ============================================
// 用户管理
// ============================================

export function loginUser(phone: string): User {
  const user: User = {
    phone,
    loggedInAt: Date.now(),
  };
  users.set(phone, user);
  return user;
}

export function getUser(phone: string): User | undefined {
  return users.get(phone);
}

export function isAuthenticated(phone: string): boolean {
  return users.has(phone);
}

// ============================================
// 速率限制
// ============================================

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const requests = rateLimits.get(key) || [];

  // 清理过期记录
  const validRequests = requests.filter((t) => now - t < windowMs);

  if (validRequests.length >= maxRequests) {
    rateLimits.set(key, validRequests);
    return false;
  }

  validRequests.push(now);
  rateLimits.set(key, validRequests);
  return true;
}

// ============================================
// 工具函数
// ============================================

function generateDeviceToken(phone: string, deviceId: string): string {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${phone}:${deviceId}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

function generateCommandId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random = Array.from({ length: 12 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
  return `cmd_${Date.now().toString(36)}_${random}`;
}
