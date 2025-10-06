// apps/web/src/lib/settings.ts
'use client';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Settings = {
  // 基本
  displayName: string;     // 表示名（任意）
  deviceName: string;      // 端末名（手入力）

  // 表示
  theme: ThemeMode;        // テーマ
  density: 'comfortable' | 'compact'; // 余白感

  // スキャン
  preferBackCamera: boolean;  // 背面カメラを優先
  scanBeep: boolean;          // 読み取り時に音/バイブ（UIだけ先に）
  scanContinuous: boolean;    // 連続読み取り（将来用）

  // 検索/絞り込み
  keepFiltersOnNav: boolean;  // ルーティングで q/qr を引き継ぐ（既に対応済みの既定）
  sortDefault: 'updatedDesc' | 'nameAsc';

  // ラベル/QR
  labelTapeWidthMM: 24;       // 24固定想定だがUIで持っておく
  labelQrSizeMM: number;      // QRの実寸(mm)
  labelShowText: boolean;     // コード文字列を併記

  // QRペイロード
  qrPayloadMode: 'code' | 'url'; // 生コード or URL
  qrUrlPrefix: string;           // url時の prefix（例: https://your.host/b/）

  // バックアップ既定
  backupIncludeThumbs: boolean;  // サムネ含める既定
};

// 既定値
export const defaultSettings: Settings = {
  displayName: '',
  deviceName: typeof navigator !== 'undefined' ? (navigator.platform || 'device') : 'device',

  theme: 'system',
  density: 'comfortable',

  preferBackCamera: true,
  scanBeep: false,
  scanContinuous: false,

  keepFiltersOnNav: true,
  sortDefault: 'updatedDesc',

  labelTapeWidthMM: 24 as const,
  labelQrSizeMM: 20,
  labelShowText: true,

  qrPayloadMode: 'code',
  qrUrlPrefix: '',

  backupIncludeThumbs: true,
};

const STORAGE_KEY = 'hakomokuroku.settings.v1';

// 読み書き（LocalStorage）
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  // multi-tab 反映
  try { new BroadcastChannel('hkmk-settings').postMessage('updated'); } catch {}
}

// Reactフック
import { useEffect, useState } from 'react';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    setSettings(loadSettings());

    // 他タブで更新されたら反映
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('hkmk-settings');
      bc.onmessage = (ev) => {
        if (ev.data === 'updated') setSettings(loadSettings());
      };
    } catch {}

    return () => { try { bc?.close(); } catch {} };
  }, []);

  // テーマを <html data-theme="..."> に反映（簡易）
  useEffect(() => {
    const html = document.documentElement;
    const mode = settings.theme;
    html.dataset.theme = mode;
  }, [settings.theme]);

  const update = <K extends keyof Settings>(key: K, val: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      saveSettings(next);
      return next;
    });
  };

  return { settings, update, setSettings };
}
