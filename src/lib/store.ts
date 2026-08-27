// ============================================
// AndroidAPS Remote Control - SQLite Store
// ============================================

import db from './db';
import {
  DeviceInfo,
  Command,
  User,
  SAFETY_RULES,
} from './types';
import crypto from 'crypto';

// ============================================
// 设备管理
// ============================================

export function registerDevice(
  phone: string,
  deviceId: string,
  appVersion: string
): { deviceToken: string; message: string } {
  const deviceToken = crypto
    .createHash('sha256')
    .update(`${phone}:${deviceId}:${Date.now()}:${Math.random()}`)
    .digest('hex');

  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO devices (phone, device_id, device_token, app_version, last_heartbeat, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      device_id = excluded.device_id,
      device_token = excluded.device_token,
      app_version = excluded.app_version,
      last_heartbeat = excluded.last_heartbeat,
      registered_at = excluded.registered_at
  `);

  stmt.run(phone, deviceId, deviceToken, appVersion, now, now);

  return { deviceToken, message: `设备 ${deviceId} 注册成功` };
}

export function updateHeartbeat(
  phone: string,
  deviceId: string,
  deviceToken: string
): boolean {
  const device = getDevice(phone);
  if (!device) return false;
  if (device.deviceId !== deviceId) return false;
  if (device.deviceToken !== deviceToken) return false;

  const now = Date.now();
  db.prepare('UPDATE devices SET last_heartbeat = ? WHERE phone = ?').run(now, phone);
  return true;
}

export function getDevice(phone: string): DeviceInfo | undefined {
  const row = db.prepare('SELECT * FROM devices WHERE phone = ?').get(phone) as any;
  if (!row) return undefined;
  return {
    phone: row.phone,
    deviceId: row.device_id,
    deviceToken: row.device_token,
    appVersion: row.app_version,
    lastHeartbeat: row.last_heartbeat,
    registeredAt: row.registered_at,
  };
}

export function isDeviceOnline(phone: string): boolean {
  const device = getDevice(phone);
  if (!device) return false;
  return Date.now() - device.lastHeartbeat < 60000;
}

export function getDeviceStatus(phone: string): 'online' | 'offline' | 'not_registered' {
  const device = getDevice(phone);
  if (!device) return 'not_registered';
  return isDeviceOnline(phone) ? 'online' : 'offline';
}

export function authenticateDevice(
  phone: string,
  deviceId: string,
  deviceToken: string
): boolean {
  const device = getDevice(phone);
  if (!device) return false;
  if (device.deviceId !== deviceId) return false;
  if (device.deviceToken !== deviceToken) return false;
  return true;
}

// ============================================
// 命令管理
// ============================================

function generateCommandId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random = Array.from({ length: 12 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
  return `cmd_${Date.now().toString(36)}_${random}`;
}

export function createCommand(
  phone: string,
  type: 'bolus' | 'carbs',
  insulin?: number,
  carbs?: number
): Command {
  const now = Date.now();
  const id = generateCommandId();
  const expiresAt = now + SAFETY_RULES.COMMAND_EXPIRY_MINUTES * 60 * 1000;

  db.prepare(`
    INSERT INTO commands (id, phone, type, insulin, carbs, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, phone, type, insulin ?? null, carbs ?? null, now, expiresAt);

  return {
    id,
    phone,
    type,
    insulin,
    carbs,
    status: 'pending',
    createdAt: now,
    expiresAt,
  };
}

export function getPendingCommands(phone: string): Command[] {
  const now = Date.now();

  // 先标记过期命令
  db.prepare(`
    UPDATE commands SET status = 'expired'
    WHERE phone = ? AND status = 'pending' AND expires_at < ?
  `).run(phone, now);

  const rows = db.prepare(`
    SELECT * FROM commands
    WHERE phone = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).all(phone) as any[];

  return rows.map(rowToCommand);
}

export function updateCommandStatus(
  commandId: string,
  phone: string,
  deviceId: string,
  deviceToken: string,
  success: boolean,
  message: string
): Command | null {
  const command = getCommand(commandId, phone);
  if (!command) return null;

  // 验证设备身份
  const device = getDevice(phone);
  if (!device) return null;
  if (device.deviceId !== deviceId) return null;
  if (device.deviceToken !== deviceToken) return null;

  const newStatus = success ? 'completed' : 'failed';
  const result = {
    success,
    message,
    executedAt: Date.now(),
  };

  db.prepare(`
    UPDATE commands SET status = ?, result_json = ?
    WHERE id = ? AND phone = ?
  `).run(newStatus, JSON.stringify(result), commandId, phone);

  return {
    ...command,
    status: newStatus as Command['status'],
    result,
  };
}

export function getCommand(commandId: string, phone: string): Command | null {
  const row = db.prepare(`
    SELECT * FROM commands WHERE id = ? AND phone = ?
  `).get(commandId, phone) as any;

  if (!row) return null;
  return rowToCommand(row);
}

function rowToCommand(row: any): Command {
  return {
    id: row.id,
    phone: row.phone,
    type: row.type,
    insulin: row.insulin ?? undefined,
    carbs: row.carbs ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
  };
}

// ============================================
// 用户管理
// ============================================

export function loginUser(phone: string, pin: string): User {
  const now = Date.now();

  // 使用 upsert：如果用户已存在则更新 PIN，不存在则创建
  db.prepare(`
    INSERT INTO users (phone, pin, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET pin = excluded.pin
  `).run(phone, pin, now);

  return { phone, pin, loggedInAt: now };
}

export function getUser(phone: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;
  if (!row) return undefined;
  return {
    phone: row.phone,
    pin: row.pin,
    loggedInAt: row.created_at,
  };
}

export function isAuthenticated(phone: string): boolean {
  const row = db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
  return !!row;
}

export function verifyUser(phone: string, pin: string): boolean {
  const row = db.prepare('SELECT pin FROM users WHERE phone = ?').get(phone) as any;
  if (!row) return false;
  return row.pin === pin;
}

// ============================================
// Nightscout 配置（每用户隔离）
// ============================================

export function getNsConfig(phone: string): { url: string; apiSecret: string } {
  const row = db.prepare('SELECT * FROM ns_configs WHERE phone = ?').get(phone) as any;
  if (!row) return { url: '', apiSecret: '' };
  return { url: row.url, apiSecret: row.api_secret };
}

export function saveNsConfig(phone: string, url: string, apiSecret: string): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO ns_configs (phone, url, api_secret, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      url = excluded.url,
      api_secret = excluded.api_secret,
      updated_at = excluded.updated_at
  `).run(phone, url, apiSecret, now, now);
}

// ============================================
// 安全规则配置（每用户隔离）
// ============================================

export function getSafetyConfig(phone: string): {
  maxBolusUnits: number;
  maxCarbsGrams: number;
  insulinLockMinutes: number;
  carbsLockMinutes: number;
  commandTimeoutMinutes: number;
} {
  const row = db.prepare('SELECT * FROM safety_configs WHERE phone = ?').get(phone) as any;
  if (!row) {
    return {
      maxBolusUnits: SAFETY_RULES.MAX_BOLUS_UNITS,
      maxCarbsGrams: SAFETY_RULES.MAX_CARBS_GRAMS,
      insulinLockMinutes: SAFETY_RULES.INSULIN_LOCK_MINUTES,
      carbsLockMinutes: SAFETY_RULES.CARBS_LOCK_MINUTES,
      commandTimeoutMinutes: SAFETY_RULES.COMMAND_EXPIRY_MINUTES,
    };
  }
  return {
    maxBolusUnits: row.max_bolus_units,
    maxCarbsGrams: row.max_carbs_grams,
    insulinLockMinutes: row.insulin_lock_minutes,
    carbsLockMinutes: row.carbs_lock_minutes,
    commandTimeoutMinutes: row.command_timeout_minutes,
  };
}

export function saveSafetyConfig(
  phone: string,
  config: {
    maxBolusUnits: number;
    maxCarbsGrams: number;
    insulinLockMinutes: number;
    carbsLockMinutes: number;
    commandTimeoutMinutes: number;
  }
): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO safety_configs (phone, max_bolus_units, max_carbs_grams, insulin_lock_minutes, carbs_lock_minutes, command_timeout_minutes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      max_bolus_units = excluded.max_bolus_units,
      max_carbs_grams = excluded.max_carbs_grams,
      insulin_lock_minutes = excluded.insulin_lock_minutes,
      carbs_lock_minutes = excluded.carbs_lock_minutes,
      command_timeout_minutes = excluded.command_timeout_minutes,
      updated_at = excluded.updated_at
  `).run(
    phone,
    config.maxBolusUnits,
    config.maxCarbsGrams,
    config.insulinLockMinutes,
    config.carbsLockMinutes,
    config.commandTimeoutMinutes,
    now,
    now
  );
}

// ============================================
// 速率限制（仍使用内存，因为不需要持久化）
// ============================================

const rateLimits = new Map<string, number[]>();

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
