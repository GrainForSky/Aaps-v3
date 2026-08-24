'use client';

import { useState, useCallback, useRef } from 'react';
import type { Command, CommandStatus } from '@/lib/types';

type RemoteCommandStatus =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'polling'
  | 'completed'
  | 'failed'
  | 'timeout';

interface RemoteCommandResult {
  status: RemoteCommandStatus;
  command: Command | null;
  message: string;
}

interface UseRemoteCommandReturn {
  commandState: RemoteCommandResult;
  sendCommand: (
    phone: string,
    type: 'bolus' | 'carbs',
    insulin?: number,
    carbs?: number
  ) => Promise<void>;
  reset: () => void;
}

export function useRemoteCommand(): UseRemoteCommandReturn {
  const [commandState, setCommandState] = useState<RemoteCommandResult>({
    status: 'idle',
    command: null,
    message: '',
  });
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const reset = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setCommandState({ status: 'idle', command: null, message: '' });
  }, []);

  const pollCommandStatus = useCallback(
    async (commandId: string, phone: string, maxAttempts: number = 24) => {
      let attempts = 0;

      const poll = async () => {
        attempts++;

        try {
          const res = await fetch(
            `/api/command/status?id=${commandId}&phone=${phone}`
          );
          const data = await res.json();

          if (data.success && data.command) {
            const cmd: Command = data.command;

            if (cmd.status === 'completed') {
              setCommandState({
                status: 'completed',
                command: cmd,
                message: `命令执行成功：${cmd.result?.message || '已完成'}`,
              });
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              return;
            }

            if (cmd.status === 'failed') {
              setCommandState({
                status: 'failed',
                command: cmd,
                message: `命令执行失败：${cmd.result?.message || '未知错误'}`,
              });
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              return;
            }

            if (cmd.status === 'expired') {
              setCommandState({
                status: 'timeout',
                command: cmd,
                message: '命令已过期，设备未在规定时间内执行',
              });
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              return;
            }

            // 仍在执行中
            setCommandState({
              status: 'polling',
              command: cmd,
              message: `等待设备执行... (${attempts}/${maxAttempts})`,
            });
          }
        } catch (error) {
          console.error('Poll error:', error);
        }

        if (attempts >= maxAttempts) {
          setCommandState({
            status: 'timeout',
            command: null,
            message: '等待超时，设备可能离线',
          });
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      };

      // 立即执行一次
      await poll();

      // 每 5 秒轮询一次
      pollTimerRef.current = setInterval(poll, 5000);
    },
    []
  );

  const sendCommand = useCallback(
    async (
      phone: string,
      type: 'bolus' | 'carbs',
      insulin?: number,
      carbs?: number
    ) => {
      reset();
      setCommandState({ status: 'sending', command: null, message: '正在发送命令...' });

      try {
        const res = await fetch('/api/command/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-phone': phone,
          },
          body: JSON.stringify({ phone, type, insulin, carbs }),
        });

        const data = await res.json();

        if (!data.success) {
          setCommandState({
            status: 'failed',
            command: null,
            message: data.message || '命令创建失败',
          });
          return;
        }

        setCommandState({
          status: 'sent',
          command: null,
          message: '命令已发送，等待设备接收...',
        });

        // 开始轮询命令状态
        await pollCommandStatus(data.commandId, phone);
      } catch (error) {
        console.error('Send command error:', error);
        setCommandState({
          status: 'failed',
          command: null,
          message: '网络错误，请重试',
        });
      }
    },
    [reset, pollCommandStatus]
  );

  return { commandState, sendCommand, reset };
}
