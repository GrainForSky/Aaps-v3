# AndroidAPS 远程输注控制系统

通过 Web 端远程控制 AndroidAPS 实现胰岛素和碳水输注，支持输注结果确认。

## 系统架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Web 用户     │     │  Web 服务器   │     │  AndroidAPS 手机  │
│  (浏览器)     │     │  (云服务器)    │     │  (修改后的APP)     │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       │ 1. 登录             │                      │
       │───────────────────>│                      │
       │                    │                      │
       │ 2. 发送 BOLUS 2.5   │                      │
       │───────────────────>│                      │
       │                    │ 存入命令队列            │
       │                    │                      │ 3. 每5秒轮询
       │                    │<─────────────────────│
       │                    │  GET /api/device/    │
       │                    │  commands?phone=xxx  │
       │                    │                      │
       │                    │ 返回待执行命令          │
       │                    │─────────────────────>│
       │                    │                      │
       │                    │                      │ 4. 执行 BOLUS
       │                    │                      │ 5. 上报结果
       │                    │<─────────────────────│
       │                    │  POST /api/device/   │
       │                    │  result              │
       │                    │                      │
       │ 6. 查询结果          │                      │
       │<───────────────────│                      │
       │                    │                      │
       │ 7. 同时轮询          │                      │
       │    Nightscout 确认   │                      │
       │───────────────────>│                      │
```

## 功能特性

- **手机号登录** - 登录号码作为 AndroidAPS 设备白名单
- **设备在线状态** - 实时显示 AndroidAPS 设备在线/离线状态
- **远程输注** - 胰岛素 BOLUS / 碳水 CARBS 命令
- **安全锁定** - 胰岛素 15 分钟 / 碳水 1 分钟防重复
- **二次确认** - 所有医疗操作需要确认弹窗
- **Nightscout 集成** - CGM 血糖、泵状态、治疗历史
- **输注结果确认** - 命令状态 + Nightscout 双重确认

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript 5 + shadcn/ui + Tailwind CSS 4
- **后端**: Next.js API Routes（设备管理 + 命令队列 + Nightscout 代理）
- **Android**: AndroidAPS 3.4 + RemoteControl 插件（Kotlin）

## 快速开始

### 1. 部署 Web 服务器

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
pnpm start
```

### 2. 修改 AndroidAPS 源码

参考 `ANDROIDAPS_MODIFICATION.md` 文档，在 AndroidAPS 3.4 源码中添加 RemoteControl 插件。

### 3. 配置设备

1. 在 AndroidAPS 设置中启用 RemoteControl 插件
2. 配置 Web 服务器地址（如 `https://your-server.com`）
3. 输入注册时使用的手机号
4. 设备自动注册并获取设备令牌

### 4. 使用远程控制

1. 打开 Web 界面，输入手机号登录
2. 配置 Nightscout URL 和 API Secret
3. 查看设备在线状态
4. 在"输注控制"标签页执行胰岛素/碳水输注
5. 查看命令状态和输注结果

## API 文档

### 设备管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/device/login` | POST | 用户登录 |
| `/api/device/register` | POST | 设备注册 |
| `/api/device/heartbeat` | POST | 设备心跳 |
| `/api/device/commands` | GET | 设备轮询命令 |
| `/api/device/result` | POST | 设备上报结果 |
| `/api/device/status` | GET | 查询设备状态 |

### 命令管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/command/create` | POST | 创建命令 |
| `/api/command/status` | GET | 查询命令状态 |

### Nightscout 代理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/nightscout/config` | POST | 测试连接 |
| `/api/nightscout/treatments` | GET | 治疗记录 |
| `/api/nightscout/status` | GET | 设备状态 |
| `/api/nightscout/entries` | GET | CGM 血糖数据 |
| `/api/nightscout/ping` | GET | 健康检查 |

## 安全机制

- **设备认证** - 设备注册时生成 deviceToken，后续请求必须携带
- **用户授权** - 用户只能操作自己手机号的设备
- **速率限制** - 命令创建 10 次/分钟，设备注册 5 次/分钟
- **剂量限制** - 胰岛素≤25U，碳水≤150g
- **命令有效期** - 5 分钟未执行自动失效
- **安全锁定** - 胰岛素 15 分钟，碳水 1 分钟

## 项目结构

```
.
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── device/          # 设备管理 API
│   │   │   ├── command/         # 命令管理 API
│   │   │   └── nightscout/      # Nightscout 代理 API
│   │   ├── layout.tsx
│   │   └── page.tsx             # 主页面
│   ├── components/ui/           # shadcn/ui 组件
│   ├── hooks/
│   │   ├── use-safety-lock.ts   # 安全锁定 Hook
│   │   └── use-remote-command.ts # 远程命令 Hook
│   ├── lib/
│   │   ├── types.ts             # 类型定义
│   │   ├── utils.ts             # 工具函数
│   │   └── store.ts             # 内存数据存储
│   └── server.ts                # 自定义服务器
├── ANDROIDAPS_MODIFICATION.md   # AndroidAPS 源码修改方案
└── README.md
```

## 故障排查

### 设备离线

1. 检查 AndroidAPS 手机网络连接
2. 检查 RemoteControl 插件是否启用
3. 检查服务器地址配置是否正确
4. 查看 AndroidAPS 日志中的 RemoteControl 相关日志

### 命令未执行

1. 检查设备是否在线
2. 检查命令是否在 5 分钟有效期内
3. 查看 AndroidAPS 日志中的命令轮询记录
4. 检查设备令牌是否匹配

### Nightscout 连接失败

1. 检查 Nightscout URL 是否正确
2. 检查 API Secret 是否正确
3. 检查 Nightscout 服务是否正常运行
4. 查看 Web 服务器日志中的 Nightscout 代理错误
