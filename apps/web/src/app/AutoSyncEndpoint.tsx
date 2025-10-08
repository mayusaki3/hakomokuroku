'use client';

import { useEffect } from 'react';
import { ensureSyncBaseUrlUpToDate } from '@/lib/sync-settings';

/** 現在のオリジンを毎回保存して同期先 baseUrl を最新化する */
export default function AutoSyncEndpoint() {
  useEffect(() => {
    ensureSyncBaseUrlUpToDate();
  }, []);
  return null;
}
