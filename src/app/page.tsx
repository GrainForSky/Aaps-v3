'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Syringe,
  UtensilsCrossed,
  Loader2,
  LogOut,
  Settings,
  Heart,
  Zap,
  Battery,
  Droplets,
  RefreshCw,
  Shield,
  Timer,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useSafetyLock } from '@/hooks/use-safety-lock';
import { useRemoteCommand } from '@/hooks/use-remote-command';
import { cn, isValidPhone, timeAgo } from '@/lib/utils';

// ============================================
// 类型定义
// ============================================

interface NightscoutConfig {
  url: string;
  apiSecret: string;
}

interface DeviceStatus {
  phone: string;
  status: 'online' | 'offline' | 'not_registered';
  lastHeartbeat?: number;
}

// ============================================
// 登录界面
// ============================================

function LoginScreen({ onLogin }: { onLogin: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!isValidPhone(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    if (!pin || pin.length < 4) {
      setError('PIN 码至少 4 位');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/device/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();

      if (data.success) {
        onLogin(phone);
      } else {
        setError(data.message || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">AndroidAPS 远程控制</CardTitle>
          <CardDescription className="text-slate-400">
            输入手机号和 PIN 码登录，远程管理胰岛素和碳水输注
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">手机号</label>
            <Input
              placeholder="请输入手机号"
              value={phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
              maxLength={11}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">PIN 码</label>
            <Input
              type="password"
              placeholder="请输入 PIN 码（首次登录将自动注册）"
              value={pin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleLogin()}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
              maxLength={8}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleLogin}
            disabled={loading || !phone || !pin}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? '登录中...' : '登录'}
          </Button>

          <p className="text-xs text-center text-slate-500">
            登录号码需与 AndroidAPS 设备上注册的号码一致
            <br />
            首次登录将自动创建账户，请记住您的 PIN 码
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// 配置界面
// ============================================

interface SafetyConfigType {
  insulinLockMinutes: number;
  carbsLockMinutes: number;
  maxBolusUnits: number;
  maxCarbsGrams: number;
  commandTimeoutMinutes: number;
}

function ConfigScreen({
  phone,
  config,
  safetyConfig,
  onSave,
  onSaveSafety,
  onBack,
}: {
  phone: string;
  config: NightscoutConfig;
  safetyConfig: SafetyConfigType;
  onSave: (config: NightscoutConfig) => void;
  onSaveSafety: (config: SafetyConfigType) => void;
  onBack: () => void;
}) {
  const [url, setUrl] = useState(config.url);
  const [apiSecret, setApiSecret] = useState(config.apiSecret);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; debug?: { baseUrl: string; endpointsTested: string[] } } | null>(null);

  // 可配置的安全规则（从父组件传入）
  const [maxBolusUnits, setMaxBolusUnits] = useState<number>(safetyConfig.maxBolusUnits);
  const [maxCarbsGrams, setMaxCarbsGrams] = useState<number>(safetyConfig.maxCarbsGrams);
  const [insulinLockMinutes, setInsulinLockMinutes] = useState<number>(safetyConfig.insulinLockMinutes);
  const [carbsLockMinutes, setCarbsLockMinutes] = useState<number>(safetyConfig.carbsLockMinutes);

  const testConnection = async () => {
    if (!url || !apiSecret) {
      setTestResult({ success: false, message: '请填写完整信息' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/nightscout/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, apiSecret }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        debug: data.debug,
      });
    } catch {
      setTestResult({ success: false, message: '网络错误' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSave({ url, apiSecret });
    // 保存安全规则到父组件
    onSaveSafety({
      maxBolusUnits,
      maxCarbsGrams,
      insulinLockMinutes,
      carbsLockMinutes,
      commandTimeoutMinutes: 5,
    });
    onBack(); // 保存后关闭对话框
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">系统配置</h1>
          <Button variant="outline" onClick={onBack} className="border-slate-600 text-slate-300">
            <LogOut className="w-4 h-4 mr-2" />
            返回
          </Button>
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-cyan-400" />
              Nightscout 配置
            </CardTitle>
            <CardDescription className="text-slate-400">
              配置 Nightscout 连接以读取血糖和设备数据
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Nightscout URL</label>
              <Input
                placeholder="https://your-nightscout.herokuapp.com"
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">API Secret</label>
              <Input
                type="password"
                placeholder="输入 API Secret"
                value={apiSecret}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiSecret(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={testConnection}
                disabled={testing}
                variant="outline"
                className="border-cyan-600 text-cyan-400 hover:bg-cyan-600/10"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {testing ? '测试中...' : '测试连接'}
              </Button>
              <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                保存配置
              </Button>
            </div>

            {testResult && (
              <Alert
                className={cn(
                  testResult.success
                    ? 'bg-green-500/10 border-green-500/50'
                    : 'bg-red-500/10 border-red-500/50'
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <AlertDescription
                  className={cn(
                    testResult.success ? 'text-green-400' : 'text-red-400'
                  )}
                >
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}

            {testResult && !testResult.success && 'debug' in testResult && testResult.debug && (
              <div className="text-xs text-slate-500 space-y-1">
                <div>调试信息：</div>
                <div>• 服务器地址：{testResult.debug.baseUrl}</div>
                <div>• 测试的接口：</div>
                <ul className="list-disc list-inside ml-2">
                  {testResult.debug.endpointsTested.map((ep: string, i: number) => (
                    <li key={i}>{ep}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              安全规则配置
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">最大胰岛素剂量 (U)</label>
                <Input
                  type="number"
                  value={maxBolusUnits}
                  onChange={(e) => setMaxBolusUnits(Number(e.target.value))}
                  min={1}
                  max={50}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">最大碳水剂量 (g)</label>
                <Input
                  type="number"
                  value={maxCarbsGrams}
                  onChange={(e) => setMaxCarbsGrams(Number(e.target.value))}
                  min={1}
                  max={300}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">胰岛素锁定时间 (分钟)</label>
                <Input
                  type="number"
                  value={insulinLockMinutes}
                  onChange={(e) => setInsulinLockMinutes(Number(e.target.value))}
                  min={1}
                  max={60}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">碳水锁定时间 (分钟)</label>
                <Input
                  type="number"
                  value={carbsLockMinutes}
                  onChange={(e) => setCarbsLockMinutes(Number(e.target.value))}
                  min={1}
                  max={30}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// 设备状态指示器
// ============================================

function DeviceStatusIndicator({
  status,
  lastHeartbeat,
  onRefresh,
}: {
  status: DeviceStatus | null;
  lastHeartbeat?: number;
  onRefresh: () => void;
}) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <WifiOff className="w-4 h-4" />
        <span className="text-sm">未连接设备</span>
      </div>
    );
  }

  const isOnline = status.status === 'online';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="w-4 h-4 text-green-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
        <span
          className={cn(
            'text-sm font-medium',
            isOnline ? 'text-green-400' : 'text-red-400'
          )}
        >
          {isOnline ? '设备在线' : status.status === 'offline' ? '设备离线' : '未注册'}
        </span>
      </div>

      {lastHeartbeat && (
        <span className="text-xs text-slate-500">
          最后心跳：{timeAgo(lastHeartbeat)}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="text-slate-400 hover:text-white"
      >
        <RefreshCw className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ============================================
// 输注控制面板
// ============================================

function DeliveryControl({
  phone,
  nsConfig,
  safetyConfig: externalSafetyConfig,
}: {
  phone: string;
  nsConfig: NightscoutConfig;
  safetyConfig: {
    insulinLockMinutes: number;
    carbsLockMinutes: number;
    maxBolusUnits: number;
    maxCarbsGrams: number;
    commandTimeoutMinutes: number;
  };
}) {
  const { isInsulinLocked, isCarbsLocked, insulinCountdown, carbsCountdown, recordBolus, recordCarbs } =
    useSafetyLock(externalSafetyConfig.insulinLockMinutes, externalSafetyConfig.carbsLockMinutes);
  const { commandState, sendCommand, reset } = useRemoteCommand();

  const [insulinDose, setInsulinDose] = useState('');
  const [carbsDose, setCarbsDose] = useState('');
  const [showInsulinConfirm, setShowInsulinConfirm] = useState(false);
  const [showCarbsConfirm, setShowCarbsConfirm] = useState(false);

  const handleInsulinSubmit = async () => {
    const dose = parseFloat(insulinDose);
    if (isNaN(dose) || dose <= 0 || dose > externalSafetyConfig.maxBolusUnits) {
      return;
    }
    setShowInsulinConfirm(false);
    await sendCommand(phone, 'bolus', dose);
    if (commandState.status === 'completed') {
      recordBolus();
    }
  };

  const handleCarbsSubmit = async () => {
    const dose = parseFloat(carbsDose);
    if (isNaN(dose) || dose <= 0 || dose > externalSafetyConfig.maxCarbsGrams) {
      return;
    }
    setShowCarbsConfirm(false);
    await sendCommand(phone, 'carbs', undefined, dose);
    if (commandState.status === 'completed') {
      recordCarbs();
    }
  };

  const quickDoses = [0.5, 1, 1.5, 2, 2.5, 3, 5];
  const quickCarbs = [5, 10, 15, 20, 30, 50];

  return (
    <div className="space-y-6">
      {/* 命令状态横幅 */}
      {commandState.status !== 'idle' && (
        <Alert
          className={cn(
            commandState.status === 'completed'
              ? 'bg-green-500/10 border-green-500/50'
              : commandState.status === 'failed' || commandState.status === 'timeout'
              ? 'bg-red-500/10 border-red-500/50'
              : 'bg-cyan-500/10 border-cyan-500/50'
          )}
        >
          {commandState.status === 'sending' || commandState.status === 'sent' || commandState.status === 'polling' ? (
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          ) : commandState.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          <AlertDescription
            className={cn(
              commandState.status === 'completed'
                ? 'text-green-400'
                : commandState.status === 'failed' || commandState.status === 'timeout'
                ? 'text-red-400'
                : 'text-cyan-400'
            )}
          >
            {commandState.message}
          </AlertDescription>
          {(commandState.status === 'completed' ||
            commandState.status === 'failed' ||
            commandState.status === 'timeout') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="ml-auto text-slate-400 hover:text-white"
            >
              关闭
            </Button>
          )}
        </Alert>
      )}

      {/* 胰岛素输注 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Syringe className="w-5 h-5 text-amber-400" />
            胰岛素输注
          </CardTitle>
          <CardDescription className="text-slate-400">
            远程发送 BOLUS 命令到 AndroidAPS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInsulinLocked && (
            <Alert className="bg-amber-500/10 border-amber-500/50">
              <Timer className="w-4 h-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                安全锁定中，{Math.floor(insulinCountdown / 60)}分{insulinCountdown % 60}秒后可再次输注
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">剂量 (U)</label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max={externalSafetyConfig.maxBolusUnits}
              placeholder={`0.1 - ${externalSafetyConfig.maxBolusUnits}`}
              value={insulinDose}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInsulinDose(e.target.value)}
              disabled={isInsulinLocked || commandState.status !== 'idle'}
              className="bg-slate-700/50 border-slate-600 text-white text-2xl font-bold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickDoses.map((dose) => (
              <Button
                key={dose}
                variant="outline"
                size="sm"
                onClick={() => setInsulinDose(dose.toString())}
                disabled={isInsulinLocked}
                className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10"
              >
                {dose}U
              </Button>
            ))}
          </div>

          <Button
            onClick={() => setShowInsulinConfirm(true)}
            disabled={isInsulinLocked || !insulinDose || commandState.status !== 'idle'}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white"
          >
            <Send className="w-4 h-4 mr-2" />
            发送胰岛素命令
          </Button>
        </CardContent>
      </Card>

      {/* 碳水输注 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-green-400" />
            碳水输注
          </CardTitle>
          <CardDescription className="text-slate-400">
            远程发送 CARBS 命令到 AndroidAPS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCarbsLocked && (
            <Alert className="bg-amber-500/10 border-amber-500/50">
              <Timer className="w-4 h-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                安全锁定中，{carbsCountdown}秒后可再次输注
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">剂量 (g)</label>
            <Input
              type="number"
              step="1"
              min="1"
              max={externalSafetyConfig.maxCarbsGrams}
              placeholder={`1 - ${externalSafetyConfig.maxCarbsGrams}`}
              value={carbsDose}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCarbsDose(e.target.value)}
              disabled={isCarbsLocked || commandState.status !== 'idle'}
              className="bg-slate-700/50 border-slate-600 text-white text-2xl font-bold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickCarbs.map((dose) => (
              <Button
                key={dose}
                variant="outline"
                size="sm"
                onClick={() => setCarbsDose(dose.toString())}
                disabled={isCarbsLocked}
                className="border-green-600/50 text-green-400 hover:bg-green-600/10"
              >
                {dose}g
              </Button>
            ))}
          </div>

          <Button
            onClick={() => setShowCarbsConfirm(true)}
            disabled={isCarbsLocked || !carbsDose || commandState.status !== 'idle'}
            className="w-full bg-green-600 hover:bg-green-500 text-white"
          >
            <Send className="w-4 h-4 mr-2" />
            发送碳水命令
          </Button>
        </CardContent>
      </Card>

      {/* 确认弹窗 */}
      {showInsulinConfirm && (
        <ConfirmDialog
          title="确认胰岛素输注"
          message={`即将发送 ${insulinDose}U 胰岛素到 AndroidAPS，请确认。`}
          onConfirm={handleInsulinSubmit}
          onCancel={() => setShowInsulinConfirm(false)}
        />
      )}

      {showCarbsConfirm && (
        <ConfirmDialog
          title="确认碳水输注"
          message={`即将发送 ${carbsDose}g 碳水到 AndroidAPS，请确认。`}
          onConfirm={handleCarbsSubmit}
          onCancel={() => setShowCarbsConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================
// 确认弹窗
// ============================================

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-300">{message}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1 border-slate-600 text-slate-300"
            >
              取消
            </Button>
            <Button
              onClick={onConfirm}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white"
            >
              确认执行
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// 数据查看面板
// ============================================

function DataPanel({ nsConfig }: { nsConfig: NightscoutConfig }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [pumpStatus, setPumpStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!nsConfig.url || !nsConfig.apiSecret) return;

    setLoading(true);
    try {
      const [entriesRes, treatmentsRes, statusRes] = await Promise.all([
        fetch(`/api/nightscout/entries?url=${encodeURIComponent(nsConfig.url)}&apiSecret=${nsConfig.apiSecret}`),
        fetch(`/api/nightscout/treatments?url=${encodeURIComponent(nsConfig.url)}&apiSecret=${nsConfig.apiSecret}&count=20`),
        fetch(`/api/nightscout/status?url=${encodeURIComponent(nsConfig.url)}&apiSecret=${nsConfig.apiSecret}`),
      ]);

      const entriesData = await entriesRes.json();
      const treatmentsData = await treatmentsRes.json();
      const statusData = await statusRes.json();

      if (entriesData.success) setEntries(entriesData.data);
      if (treatmentsData.success) setTreatments(treatmentsData.data);
      if (statusData.success) setPumpStatus(statusData.data);
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setLoading(false);
    }
  }, [nsConfig.url, nsConfig.apiSecret]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // 未配置 Nightscout 时显示提示
  if (!nsConfig.url || !nsConfig.apiSecret) {
    return (
      <div className="space-y-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Database className="w-16 h-16 mx-auto text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-slate-300 mb-2">未配置 Nightscout</h3>
              <p className="text-sm text-slate-500 mb-4">
                请先在配置页面设置 Nightscout URL 和 API Secret
              </p>
              <p className="text-xs text-slate-600">
                配置后数据将自动显示在此处
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestEntry = entries[0];
  const bgValue = latestEntry?.sgv;
  const bgTrend = latestEntry?.direction;

  return (
    <div className="space-y-6">
      {/* 当前血糖 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-400" />
            当前血糖
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bgValue ? (
            <div className="text-center">
              <div className="text-6xl font-bold text-cyan-400">{bgValue}</div>
              <div className="text-slate-400 mt-2">
                mg/dL {bgTrend && `(${bgTrend})`}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {timeAgo(latestEntry.date)}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              {loading ? '加载中...' : '无数据'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 泵状态 */}
      {pumpStatus?.pump && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              泵状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Battery className="w-4 h-4 text-green-400" />
                <div>
                  <div className="text-sm text-slate-400">电池</div>
                  <div className="text-white font-medium">
                    {pumpStatus.pump.battery?.status || '未知'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-sm text-slate-400">储药器</div>
                  <div className="text-white font-medium">
                    {pumpStatus.pump.reservoir || 0}U
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 治疗记录 */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            治疗记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {treatments.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {treatments.map((t: any) => (
                <div
                  key={t._id}
                  className="flex items-center justify-between p-2 bg-slate-700/30 rounded"
                >
                  <div>
                    <Badge
                      variant={
                        t.eventType === 'Bolus'
                          ? 'default'
                          : t.eventType === 'Carb Correction'
                          ? 'secondary'
                          : 'outline'
                      }
                      className={cn(
                        t.eventType === 'Bolus'
                          ? 'bg-amber-600 text-white'
                          : t.eventType === 'Carb Correction'
                          ? 'bg-green-600 text-white'
                          : ''
                      )}
                    >
                      {t.eventType}
                    </Badge>
                    <span className="text-sm text-slate-300 ml-2">
                      {t.insulin ? `${t.insulin}U` : ''}
                      {t.carbs ? `${t.carbs}g` : ''}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {timeAgo(new Date(t.created_at).getTime())}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-500 py-4">
              {loading ? '加载中...' : '暂无记录'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// 主页面
// ============================================

export default function Home() {
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [nsConfig, setNsConfig] = useState<NightscoutConfig>({ url: '', apiSecret: '' });
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);

  // 安全规则配置（必须在 useEffect 之前声明）
  const [safetyConfig, setSafetyConfig] = useState<SafetyConfigType>({
    insulinLockMinutes: 15,
    carbsLockMinutes: 1,
    maxBolusUnits: 25,
    maxCarbsGrams: 150,
    commandTimeoutMinutes: 5,
  });

  // 从 localStorage 恢复
  useEffect(() => {
    const savedPhone = localStorage.getItem('aaps-phone');
    const savedNs = localStorage.getItem('aaps-ns-config');
    const savedSafety = localStorage.getItem('aaps-safety-config');
    if (savedPhone) setUserPhone(savedPhone);
    if (savedNs) {
      try {
        setNsConfig(JSON.parse(savedNs));
      } catch {}
    }
    if (savedSafety) {
      try {
        const parsed = JSON.parse(savedSafety);
        setSafetyConfig({
          insulinLockMinutes: parsed.insulinLockMinutes ?? 15,
          carbsLockMinutes: parsed.carbsLockMinutes ?? 1,
          maxBolusUnits: parsed.maxBolusUnits ?? 25,
          maxCarbsGrams: parsed.maxCarbsGrams ?? 150,
          commandTimeoutMinutes: parsed.commandTimeoutMinutes ?? 5,
        });
      } catch {}
    }
  }, []);

  // 加载设备状态
  const loadDeviceStatus = useCallback(async () => {
    if (!userPhone) return;
    try {
      const res = await fetch(`/api/device/status?phone=${userPhone}`, {
        headers: { 'x-user-phone': userPhone },
      });
      const data = await res.json();
      if (data.success) {
        setDeviceStatus(data);
      }
    } catch (error) {
      console.error('Load device status error:', error);
    }
  }, [userPhone]);

  useEffect(() => {
    loadDeviceStatus();
    const timer = setInterval(loadDeviceStatus, 10000);
    return () => clearInterval(timer);
  }, [loadDeviceStatus]);

  const handleLogin = (phone: string) => {
    setUserPhone(phone);
    localStorage.setItem('aaps-phone', phone);
  };

  const handleLogout = () => {
    setUserPhone(null);
    localStorage.removeItem('aaps-phone');
    setDeviceStatus(null);
  };

  const handleSaveNsConfig = (config: NightscoutConfig) => {
    setNsConfig(config);
    localStorage.setItem('aaps-ns-config', JSON.stringify(config));
  };

  const handleSaveSafetyConfig = (config: SafetyConfigType) => {
    setSafetyConfig(config);
    localStorage.setItem('aaps-safety-config', JSON.stringify(config));
  };

  if (!userPhone) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (showConfig) {
    return (
      <ConfigScreen
        phone={userPhone}
        config={nsConfig}
        safetyConfig={safetyConfig}
        onSave={handleSaveNsConfig}
        onSaveSafety={handleSaveSafetyConfig}
        onBack={() => setShowConfig(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 顶部导航 */}
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-cyan-400" />
            <h1 className="text-lg font-bold text-white">AndroidAPS 远程控制</h1>
          </div>
          <div className="flex items-center gap-3">
            <DeviceStatusIndicator
              status={deviceStatus}
              lastHeartbeat={deviceStatus?.lastHeartbeat}
              onRefresh={loadDeviceStatus}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(true)}
              className="text-slate-400 hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="delivery" className="space-y-6">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="delivery" className="data-[state=active]:bg-cyan-600">
              <Syringe className="w-4 h-4 mr-2" />
              输注控制
            </TabsTrigger>
            <TabsTrigger value="data" className="data-[state=active]:bg-cyan-600">
              <Activity className="w-4 h-4 mr-2" />
              数据查看
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery">
            <DeliveryControl phone={userPhone} nsConfig={nsConfig} safetyConfig={safetyConfig} />
          </TabsContent>

          <TabsContent value="data">
            <DataPanel nsConfig={nsConfig} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
