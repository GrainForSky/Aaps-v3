# AndroidAPS 远程输注系统

完整的 AndroidAPS 远程胰岛素输注解决方案，通过修改 AndroidAPS 源码实现 Web 端远程控制。

## 系统架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Web 用户     │     │  Web 后端     │     │  AndroidAPS 手机  │
│  (浏览器)     │     │  (云服务器)    │     │  (修改后的APP)     │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       │ 1. 登录             │                      │
       │───────────────────>│                      │
       │                    │                      │
       │ 2. 发送 BOLUS 2.5   │                      │
       │───────────────────>│                      │
       │                    │ 存入命令队列            │
       │                    │                      │ 3. 每 5 秒轮询
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

## 项目结构

```
.
├── ANDROIDAPS_MODIFICATION.md    # AndroidAPS 源码修改详细方案
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── device/           # 设备管理 API
│   │   │   │   ├── register/     # 设备注册
│   │   │   │   ├── heartbeat/    # 设备心跳
│   │   │   │   ├── commands/     # 设备轮询命令
│   │   │   │   ├── result/       # 设备上报结果
│   │   │   │   └── status/       # 设备状态查询
│   │   │   ├── command/          # 命令管理 API
│   │   │   │   ├── create/       # 创建命令
│   │   │   │   ── status/       # 查询命令状态
│   │   │   └── nightscout/       # Nightscout API 代理
│   │   ├── page.tsx              # 主页面
│   │   └── layout.tsx            # 根布局
│   ├── hooks/
│   │   ├── use-remote-command.ts # 远程命令 Hook
│   │   └── use-safety-lock.ts    # 安全锁定 Hook
│   ├── lib/
│   │   ├── types.ts              # 类型定义
│   │   ├── store.ts              # 内存数据存储
│   │   └── utils.ts              # 工具函数
│   └── components/ui/            # shadcn/ui 组件库
── package.json
├── tsconfig.json
└── .coze                           # Coze 配置
```

## 快速开始

### 第一步：修改 AndroidAPS 源码

1. **获取 AndroidAPS 3.4 源码**
   ```bash
   git clone https://github.com/nightscout/AndroidAPS.git
   cd AndroidAPS
   git checkout 3.4
   ```

2. **应用修改**
   
   按照 [ANDROIDAPS_MODIFICATION.md](./ANDROIDAPS_MODIFICATION.md) 中的说明，修改以下文件：
   
   - 新增 `RemoteControlPlugin.kt` - 插件主类
   - 新增 `RemoteControlClient.kt` - HTTP 客户端
   - 新增 `RemoteControlHandlers.kt` - 命令处理器
   - 新增 `RemoteControlService.kt` - 后台服务
   - 新增 `Command.kt` 和 `DeviceConfig.kt` - 数据类
   - 修改 `app/build.gradle.kts` - 添加依赖
   - 修改 `AndroidManifest.xml` - 添加权限

3. **编译 AndroidAPS**
   ```bash
   ./gradlew assembleDebug
   ```

4. **安装到手机**
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

### 第二步：部署 Web 后端

1. **安装依赖**
   ```bash
   pnpm install
   ```

2. **配置环境变量**
   
   创建 `.env.local` 文件：
   ```env
   COZE_WORKSPACE_PATH=/workspace/projects
   COZE_PROJECT_DOMAIN_DEFAULT=https://your-domain.com
   DEPLOY_RUN_PORT=5000
   COZE_PROJECT_ENV=PROD
   ```

3. **启动开发服务器**
   ```bash
   pnpm dev
   ```

4. **构建生产版本**
   ```bash
   pnpm build
   pnpm start
   ```

### 第三步：配置系统

1. **在 AndroidAPS 手机上**
   - 打开 AndroidAPS → 设置 → 远程控制
   - 启用远程控制
   - 输入 Web 服务器地址（如 `https://your-domain.com`）
   - 输入手机号（与 Web 登录使用相同号码）
   - 保存配置

2. **在 Web 端**
   - 访问 Web 界面
   - 输入手机号登录
   - 查看设备状态（应显示"在线"）
   - 开始远程输注

## 核心功能

### 1. 设备管理

| API | 方法 | 说明 |
|-----|------|------|
| `/api/device/register` | POST | 设备注册，返回 deviceToken |
| `/api/device/heartbeat` | POST | 设备心跳（30 秒间隔） |
| `/api/device/commands` | GET | 设备轮询待执行命令（5 秒间隔） |
| `/api/device/result` | POST | 设备上报执行结果 |
| `/api/device/status` | GET | 查询设备在线状态 |

### 2. 命令管理

| API | 方法 | 说明 |
|-----|------|------|
| `/api/command/create` | POST | 创建远程命令 |
| `/api/command/status` | GET | 查询命令状态 |

### 3. Nightscout 集成

| API | 方法 | 说明 |
|-----|------|------|
| `/api/nightscout/config` | POST | 测试 Nightscout 连接 |
| `/api/nightscout/treatments` | GET | 获取治疗记录 |
| `/api/nightscout/status` | GET | 获取设备状态 |
| `/api/nightscout/entries` | GET | 获取 CGM 血糖数据 |
| `/api/nightscout/ping` | GET | 健康检查 |

## 安全机制

### 1. 设备认证
- 设备注册时生成唯一 `deviceToken`
- 所有设备 API 请求必须携带 `deviceToken`
- Token 验证失败返回 401

### 2. 用户授权
- 用户登录后生成 `x-user-phone` header
- 只能操作自己手机号的设备
- 跨手机号操作返回 403

### 3. 速率限制
- 命令创建：10 次/分钟
- 设备注册：5 次/分钟
- 心跳：30 次/分钟

### 4. 安全限制
- 胰岛素单次最大 25U
- 碳水单次最大 150g
- 命令有效期 5 分钟
- 胰岛素输注后锁定 15 分钟
- 碳水输注后锁定 1 分钟

### 5. 二次确认
- 所有医疗操作需要弹窗确认
- 显示操作详情和风险提示

## 命令类型

| 类型 | 参数 | 说明 |
|------|------|------|
| `bolus` | `insulin` | 输注胰岛素（单位：U） |
| `carbs` | `carbs` | 输注碳水（单位：g） |
| `mixed` | `insulin`, `carbs` | 同时输注胰岛素和碳水 |
| `suspend` | - | 暂停输注 |
| `resume` | - | 恢复输注 |
| `status` | - | 查询设备状态 |

## 故障排查

### 设备显示离线

1. 检查 AndroidAPS 是否启用远程控制
2. 检查手机网络连接
3. 查看 AndroidAPS 日志（Logcat 过滤 `REMOTECONTROL`）
4. 检查 Web 服务器是否可访问

### 命令未执行

1. 检查命令是否过期（5 分钟有效期）
2. 检查剂量是否超出限制
3. 查看 AndroidAPS 日志
4. 检查设备是否在线

### 结果未上报

1. 检查网络连接
2. 查看 Web 服务器日志
3. 检查 deviceToken 是否匹配
4. 重启 AndroidAPS 远程控制插件

## 技术栈

### Web 端
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Icons**: lucide-react

### AndroidAPS 插件
- **Language**: Kotlin
- **HTTP Client**: OkHttp 4.12.0
- **JSON**: Gson 2.10.1
- **Architecture**: AndroidAPS Plugin System

## 开发命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 构建生产版本
pnpm start        # 启动生产服务器
pnpm ts-check     # TypeScript 类型检查
pnpm lint         # ESLint 检查
```

## 许可证

本项目仅供学习和研究使用。医疗操作请务必遵循医嘱，确保安全。

## 免责声明

本系统涉及医疗操作（胰岛素输注），使用时请：
1. 在医生指导下使用
2. 仔细核对剂量
3. 密切监测血糖
4. 保留手动操作能力
5. 定期检查系统状态

**作者不对因使用本系统造成的任何后果承担责任。**
