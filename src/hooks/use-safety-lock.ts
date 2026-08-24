'use client';

import { useState, useEffect, useCallback } from 'react';
import { SAFETY_RULES } from '@/lib/types';

interface SafetyLockState {
  insulinUntil: number;
  carbsUntil: number;
}

const STORAGE_KEY = 'aaps-safety-lock';

function loadSafetyLock(): SafetyLockState {
  if (typeof window === 'undefined') {
    return { insulinUntil: 0, carbsUntil: 0 };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { insulinUntil: 0, carbsUntil: 0 };
}

function saveSafetyLock(state: SafetyLockState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useSafetyLock() {
  const [lockState, setLockState] = useState<SafetyLockState>({ insulinUntil: 0, carbsUntil: 0 });
  const [now, setNow] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // 初始化时从 localStorage 加载
  useEffect(() => {
    setLockState(loadSafetyLock());
    setNow(Date.now());
    setInitialized(true);
  }, []);

  // 每秒更新当前时间
  useEffect(() => {
    if (!initialized) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [initialized]);

  const isInsulinLocked = now < lockState.insulinUntil;
  const isCarbsLocked = now < lockState.carbsUntil;

  const insulinCountdown = isInsulinLocked
    ? Math.ceil((lockState.insulinUntil - now) / 1000)
    : 0;
  const carbsCountdown = isCarbsLocked
    ? Math.ceil((lockState.carbsUntil - now) / 1000)
    : 0;

  const recordBolus = useCallback(() => {
    const newLock = {
      ...lockState,
      insulinUntil: Date.now() + SAFETY_RULES.INSULIN_LOCK_MINUTES * 60 * 1000,
    };
    setLockState(newLock);
    saveSafetyLock(newLock);
  }, [lockState]);

  const recordCarbs = useCallback(() => {
    const newLock = {
      ...lockState,
      carbsUntil: Date.now() + SAFETY_RULES.CARBS_LOCK_MINUTES * 60 * 1000,
    };
    setLockState(newLock);
    saveSafetyLock(newLock);
  }, [lockState]);

  const clearLock = useCallback(() => {
    const newLock = { insulinUntil: 0, carbsUntil: 0 };
    setLockState(newLock);
    saveSafetyLock(newLock);
  }, []);

  return {
    isInsulinLocked,
    isCarbsLocked,
    insulinCountdown,
    carbsCountdown,
    recordBolus,
    recordCarbs,
    clearLock,
  };
}
