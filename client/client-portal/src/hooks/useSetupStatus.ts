import { useState, useEffect } from 'react';

export interface UseSetupStatusResult {
  loading: boolean;
  setupRequired: boolean;
  branchId?: string;
  branchName?: string;
  error?: string;
}

export function useSetupStatus(): UseSetupStatusResult {
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [branchId, setBranchId] = useState<string | undefined>();
  const [branchName, setBranchName] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/setup/status');
        if (res.ok) {
          const data = await res.json();
          setSetupRequired(data.setupRequired);
          setBranchName(data.branchName);
          if (data.branchId) {
            setBranchId(data.branchId);
            // Store in sessionStorage so api.ts can pick it up
            sessionStorage.setItem('branch_id', data.branchId);
          }
        } else if (res.status === 503) {
          const body = await res.json();
          setSetupRequired(true);
          setBranchName(body.branchName);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check setup status');
        setSetupRequired(true);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return { loading, setupRequired, branchId, branchName, error };
}
