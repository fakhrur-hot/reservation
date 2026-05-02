import { useState, useEffect } from 'react';
import { SetupStatus } from '../types/setup.types';

const BASE = '';

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

export interface UseSetupStatusResult {
  loading: boolean;
  setupRequired: boolean;
  currentStep?: number;
  partialData?: boolean;
  branchName?: string;
  error?: string;
}

/**
 * Hook that calls GET /setup/status on mount
 * Returns setup status and loading state
 */
export function useSetupStatus(): UseSetupStatusResult {
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | undefined>();
  const [partialData, setPartialData] = useState<boolean | undefined>();
  const [branchName, setBranchName] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await request<SetupStatus>('/setup/status');
        setSetupRequired(status.setupRequired);
        setCurrentStep(status.currentStep);
        setPartialData(status.partialData);
        setBranchName(status.branchName);
        setError(undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check setup status';
        
        // Try to extract branch name from 503 response
        if (message.includes('setup_required')) {
          try {
            const res = await fetch(`/setup/status`);
            if (res.status === 503) {
              const body = await res.json();
              setBranchName(body.branchName);
            }
          } catch {
            // Ignore
          }
        }
        
        setError(message);
        // Default to requiring setup on error to be safe
        setSetupRequired(true);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return { loading, setupRequired, currentStep, partialData, branchName, error };
}
