// ============================================
// AndroidAPS Remote Control - Type Definitions
// ============================================

// 安全规则
export const SAFETY_RULES = {
  MAX_BOLUS_UNITS: 25,
  MAX_CARBS_GRAMS: 150,
  INSULIN_LOCK_MINUTES: 15,
  CARBS_LOCK_MINUTES: 1,
  COMMAND_EXPIRY_MINUTES: 5,
} as const;

// 设备注册请求
export interface DeviceRegisterRequest {
  phone: string;
  deviceId: string;
  appVersion: string;
}

// 设备注册响应
export interface DeviceRegisterResponse {
  success: boolean;
  message: string;
  deviceToken?: string;
}

// 设备心跳请求
export interface DeviceHeartbeatRequest {
  phone: string;
  deviceId: string;
  deviceToken: string;
}

// 设备心跳响应
export interface DeviceHeartbeatResponse {
  success: boolean;
  status: string;
  lastHeartbeat: number;
}

// 设备信息
export interface DeviceInfo {
  phone: string;
  deviceId: string;
  deviceToken: string;
  appVersion: string;
  lastHeartbeat: number;
  registeredAt: number;
}

// 命令类型
export type CommandType = 'bolus' | 'carbs';

// 命令状态
export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'expired';

// 命令对象
export interface Command {
  id: string;
  phone: string;
  type: CommandType;
  insulin?: number;
  carbs?: number;
  status: CommandStatus;
  createdAt: number;
  expiresAt: number;
  result?: CommandResult;
}

// 命令结果
export interface CommandResult {
  success: boolean;
  message: string;
  executedAt?: number;
}

// 命令创建请求
export interface CommandCreateRequest {
  phone: string;
  type: CommandType;
  insulin?: number;
  carbs?: number;
}

// 命令创建响应
export interface CommandCreateResponse {
  success: boolean;
  commandId: string;
  message: string;
}

// 命令状态查询响应
export interface CommandStatusResponse {
  success: boolean;
  command: Command | null;
}

// 结果上报请求
export interface ReportResultRequest {
  commandId: string;
  phone: string;
  deviceId: string;
  deviceToken: string;
  success: boolean;
  message: string;
}

// 结果上报响应
export interface ReportResultResponse {
  success: boolean;
  message: string;
  command?: Command;
}

// 设备状态响应
export interface DeviceStatusResponse {
  success: boolean;
  phone: string;
  status: 'online' | 'offline' | 'not_registered';
  lastHeartbeat?: number;
}

// Nightscout 配置
export interface NightscoutConfig {
  url: string;
  apiSecret: string;
}

// Nightscout 连接测试响应
export interface NightscoutConfigResponse {
  success: boolean;
  message: string;
  debug?: {
    endpoint?: string;
    status?: number;
    error?: string;
  };
}

// CGM 血糖数据
export interface CGMEntry {
  _id: string;
  sgv: number;
  date: number;
  dateString: string;
  trend?: number;
  direction?: string;
}

// 治疗记录
export interface TreatmentRecord {
  _id: string;
  eventType: string;
  insulin?: number;
  carbs?: number;
  created_at: string;
  enteredBy?: string;
  notes?: string;
}

// 泵状态
export interface PumpStatus {
  pump: {
    clock: string;
    battery: {
      voltage: number;
      status: string;
    };
    reservoir: number;
    status: string;
  };
}

// 安全锁定状态
export interface SafetyLock {
  insulinUntil: number;
  carbsUntil: number;
}

// 登录用户
export interface User {
  phone: string;
  loggedInAt: number;
}
