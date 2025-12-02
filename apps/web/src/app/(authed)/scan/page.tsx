'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrowserQRCodeReader } from '@zxing/browser';
import { extractBoxCodeFromText } from '@/lib/qrpayload';
import { getBoxByCode } from '@/lib/db';

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const stopRef = useRef<ReturnType<BrowserQRCodeReader['decodeFromVideoDevice']> | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | 'auto'>('auto');
  const [lastText, setLastText] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'error'>(
    'idle'
  );

  // カメラ一覧
  useEffect(() => {
    (async () => {
      try {
        // iOS/Safari 対策：一度 getUserMedia を呼ぶと enumerateDevices にラベルが出やすくなる
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {}
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      // 背面/外向きらしきものを初期選択
      const back = cams.find((d) => /back|rear|environment/i.test(`${d.label}`));
      if (back) setDeviceId(back.deviceId);
    })();
  }, []);

  // スキャン開始
  const start = async () => {
    if (status === 'running') return;
    try {
      setStatus('starting');
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();

      const constraints: MediaTrackConstraints =
        deviceId === 'auto'
          ? { facingMode: { ideal: 'environment' } }
          : { deviceId: { exact: deviceId } };

      // decodeFromVideoDevice は継続的にコールバックされる
      stopRef.current = await readerRef.current.decodeFromVideoDevice(
        deviceId === 'auto' ? undefined : deviceId,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const txt = result.getText();
            setLastText(txt);
            handleResolvedText(txt);
          }
          // err は NotFound の連発が来るので握りつぶす
        }
      );
      setStatus('running');
    } catch (e) {
      console.error(e);
      setStatus('error');
      alert('カメラの起動に失敗しました。権限を確認してください。');
    }
  };

  // 停止
  const stop = () => {
    try {
      stopRef.current?.stop();
    } catch {}
    try {
      readerRef.current?.reset();
    } catch {}
    setStatus('stopped');
  };

  // 解析 → 箱へ遷移
  const handleResolvedText = async (txt: string) => {
    const code = extractBoxCodeFromText(txt);
    if (!code) return; // 未対応形式は無視して継続
    stop(); // ヒットしたら止める（多重遷移防止）

    // ローカルDBで箱を解決
    const box = await getBoxByCode(code);
    if (box) {
      router.replace(`/boxes/${box.id}`);
    } else {
      // 未登録のコード：作成導線へ
      router.replace(`/b/${encodeURIComponent(code)}`);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>QRスキャン</h1>
      <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <div>
          <label>カメラ</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value as any)}
              style={{ padding: 6 }}
            >
              <option value="auto">自動（背面優先）</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            {status !== 'running' ? (
              <button onClick={start} style={{ padding: '6px 10px' }}>
                開始
              </button>
            ) : (
              <button onClick={stop} style={{ padding: '6px 10px' }}>
                停止
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #eee',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#000',
          }}
        >
          <video
            ref={videoRef}
            style={{ width: '100%', maxHeight: 360 }}
            autoPlay
            muted
            playsInline
          />
        </div>

        <div style={{ color: '#555' }}>
          状態: {status}　最終検出: <code>{lastText || '—'}</code>
        </div>

        <p style={{ color: '#666' }}>
          ※ 権限ダイアログで「カメラを許可」。暗い場所では明るさを上げてください。
          <br />※ 既存の印刷で <code>https://…/box/&lt;code&gt;</code> や{' '}
          <code>hk:&lt;code&gt;</code> でも自動解釈します。
        </p>
      </div>
    </main>
  );
}
