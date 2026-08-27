// ============================================
// AndroidAPS Remote Control - SQLite Database
// ============================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 数据库文件路径
const DB_DIR = process.env.NODE_ENV === 'production'
  ? '/tmp/aaps-data'
  : path.join(process.cwd(), 'data');

const DB_PATH = path.join(DB_DIR, 'aaps.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 初始化数据库
const db = new Database(DB_PATH);

// 启用 WAL 模式以提高并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建表结构
db.exec(`
  -- 用户表
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    pin TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  -- 设备表（每个用户一个设备）
  CREATE TABLE IF NOT EXISTS devices (
    phone TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    device_token TEXT NOT NULL,
    app_version TEXT,
    last_heartbeat INTEGER,
    registered_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  -- 命令队列
  CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bolus', 'carbs')),
    insulin REAL,
    carbs REAL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'executing', 'completed', 'failed', 'expired')),
    result_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  -- Nightscout 配置（每用户）
  CREATE TABLE IF NOT EXISTS ns_configs (
    phone TEXT PRIMARY KEY,
    url TEXT NOT NULL DEFAULT '',
    api_secret TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  -- 安全规则配置（每用户）
  CREATE TABLE IF NOT EXISTS safety_configs (
    phone TEXT PRIMARY KEY,
    max_bolus_units REAL NOT NULL DEFAULT 25,
    max_carbs_grams REAL NOT NULL DEFAULT 150,
    insulin_lock_minutes INTEGER NOT NULL DEFAULT 15,
    carbs_lock_minutes INTEGER NOT NULL DEFAULT 1,
    command_timeout_minutes INTEGER NOT NULL DEFAULT 5,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_commands_phone ON commands(phone);
  CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
  CREATE INDEX IF NOT EXISTS idx_commands_expires ON commands(expires_at);
`);

export default db;
