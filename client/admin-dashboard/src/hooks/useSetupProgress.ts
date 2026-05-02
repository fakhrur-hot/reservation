import { useState, useCallback, useEffect, useRef } from 'react';
import { SetupWizardState } from '../types/setup.types';

const BASE = '/api';
const STORAGE_KEY = 'setup_wizard_progress';
const DEBOUNCE_DELAY = 1000; // 1 second

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface UseSetupProgressResult {
  saveProgress: (step: number, state: Partial<SetupWizardState>) => void;
  clearProgress: () => void;
  loadProgress: () => Partial<SetupWizardState> | null;
}

/**
 * Hook that manages localStorage read/write for setup_wizard_progress
 * and debounces POST /setup/progress calls
 */
export function useSetupProgress(): UseSetupProgressResult {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Save progress to localStorage and debounce server call
  const saveProgress = useCallback((step: number, state: Partial<SetupWizardState>) => {
    // Always save to localStorage immediately
    const progressData = {
      step,
      state,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));

    // Debounce the server call
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await request('/v1/setup/progress', {
          method: 'POST',
          body: JSON.stringify({
            step,
            partialData: state,
          }),
        });
      } catch (err) {
        // Log error but don't throw - progress is already saved locally
        console.error('Failed to save setup progress to server:', err);
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // Clear progress from localStorage
  const clearProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  // Load progress from localStorage
  const loadProgress = useCallback((): Partial<SetupWizardState> | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return parsed.state || null;
    } catch {
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return { saveProgress, clearProgress, loadProgress };
}
