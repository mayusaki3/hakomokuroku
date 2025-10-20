// apps/web/src/app/(authed)/settings/vision/page.tsx
'use client';
import { useEffect, useState } from 'react';
import PageContainer from '@/app/components/PageContainer';
import ContentFrame from '@/app/components/ContentFrame';

type Provider = 'none'|'openai'|'claude'|'gemini';
export default function VisionSettingsPage(){
  const [provider,setProvider]=useState<Provider>('none');
  const [apiKey,setApiKey]=useState('');
  const [pName,setPName]=useState('');     // プロンプト（名前）
  const [pTags,setPTags]=useState('');     // プロンプト（タグ）
  const [pNote,setPNote]=useState('');     // プロンプト（メモ）
  const [thumb,setThumb]=useState<string>(''); // テスト画像サムネ（保存しない）
  const [resName,setResName]=useState(''); const [resTags,setResTags]=useState(''); const [resNote,setResNote]=useState('');
  const [err,setErr]=useState<string>('');

  useEffect(()=>{(async()=>{
    const r=await fetch('/api/settings/vision/get',{cache:'no-store'});
    if(!r.ok)return;
    const j=await r.json();
    setProvider(j.provider||'none'); setApiKey(j.apiKey||'');
    setPName(j.promptName||''); setPTags(j.promptTags||''); setPNote(j.promptNote||'');
  })();},[]);

  const save=async()=>{
    setErr('');
    const r=await fetch('/api/settings/vision/save',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider,apiKey,promptName:pName,promptTags:pTags,promptNote:pNote})});
    if(!r.ok) setErr('保存に失敗しました');
  };

  const onPick=(accept:string,id:string)=>document.getElementById(id)?.click();
  const onFile=async(input:HTMLInputElement)=>{
    const f=input.files?.[0]; if(!f) return; input.value='';
    const fd=new FormData(); fd.append('file',f);
    const r=await fetch('/api/settings/vision/test',{method:'POST',body:fd});
    const j=await r.json();
    if(r.ok){ setThumb(j.thumbDataUrl||''); setResName(j.name||''); setResTags(j.tags||''); setResNote(j.note||''); }
    else setErr(j?.error||'テスト失敗');
  };

  const Row=({label,children}:{label:string;children:any})=>(
    <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:8,alignItems:'center'}}><div style={{fontWeight:600}}>{label}</div><div>{children}</div></div>
  );

  return (
    <PageContainer>
      <ContentFrame title="画像認識 設定">
        <div style={{display:'grid',gap:12}}>
          <Row label="連携LLM">
            <select value={provider} onChange={e=>setProvider(e.target.value as Provider)}>
              <option value="none">なし</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
          </Row>
          <Row label="API-Key"><input value={apiKey} onChange={e=>setApiKey(e.target.value)} style={{width:'100%'}} /></Row>

          <hr className="hk-frame__hr" />
          <Row label="プロンプト（名前）"><textarea value={pName} onChange={e=>setPName(e.target.value)} rows={3} style={{width:'100%'}} /></Row>
          <Row label="プロンプト（タグ）"><textarea value={pTags} onChange={e=>setPTags(e.target.value)} rows={3} style={{width:'100%'}} /></Row>
          <Row label="プロンプト（メモ）"><textarea value={pNote} onChange={e=>setPNote(e.target.value)} rows={3} style={{width:'100%'}} /></Row>

          <hr className="hk-frame__hr" />
          <Row label="テスト画像">
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <button className="btn" onClick={()=>onPick('image/*','vision-file')}>ファイル選択</button>
              <button className="btn" onClick={()=>onPick('image/*;capture=camera','vision-camera')}>カメラ</button>
              {thumb && <img src={thumb} alt="thumb" style={{height:48,border:'1px solid var(--hk-border)',borderRadius:4}}/>}
              <input id="vision-file" type="file" accept="image/*" hidden onChange={(e)=>onFile(e.currentTarget)} />
              <input id="vision-camera" type="file" accept="image/*" capture="environment" hidden onChange={(e)=>onFile(e.currentTarget)} />
            </div>
          </Row>
          <Row label="認識テスト"><button className="btn" onClick={()=>{/* テストはアップロード時に即実行済み */}}>認識結果を更新</button></Row>
          <Row label="結果（名前）"><input value={resName} readOnly style={{width:'100%'}}/></Row>
          <Row label="結果（タグ）"><input value={resTags} readOnly style={{width:'100%'}}/></Row>
          <Row label="結果（メモ）"><textarea value={resNote} readOnly rows={3} style={{width:'100%'}}/></Row>

          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button className="btn" onClick={save}>保存</button>
          </div>
          {err && <div style={{color:'#b91c1c'}}>{err}</div>}
        </div>
      </ContentFrame>
    </PageContainer>
  );
}
