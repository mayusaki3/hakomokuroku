// apps/web/tests/lib.search.spec.ts
// ホーム検索/QR検索の確定挙動を検証する。
// テスト番号: LIB_SEARCH-TC-01 〜 LIB_SEARCH-TC-04
import { beforeEach, describe, expect, it, vi } from 'vitest';

const boxes:any[]=[]; const items:any[]=[];
vi.mock('@/lib/db',()=>({
  db:{
    boxes:{
      toArray:async()=>boxes,
      where:(field:string)=>({equalsIgnoreCase:(v:string)=>({first:async()=>boxes.find(x=>String(x[field]).toLowerCase()===v.toLowerCase())})})
    },
    items:{
      toArray:async()=>items,
      where:(field:string)=>({equals:(v:string)=>({toArray:async()=>items.filter(x=>x[field]===v)})})
    }
  }
}));
import { extractBoxCodeFromQr, searchByQrPayload } from '@/lib/search';

beforeEach(()=>{boxes.splice(0);items.splice(0)});

describe('lib/search QR検索',()=>{
  it('LIB_SEARCH-TC-01: canonical Box.code をQR値として抽出できる',()=>{
    expect(extractBoxCodeFromQr('BX-ABCD0001')).toBe('BX-ABCD0001');
  });
  it('LIB_SEARCH-TC-02: 登録済みBoxのQR検索はBox自体を含めず中のItemだけ返す',async()=>{
    boxes.push({id:'B1',code:'BX-ABCD0001',name:'PC用品箱'});
    items.push({id:'I1',boxId:'B1',name:'USB-Cケーブル'},{id:'I2',boxId:'B1',name:'HDMIケーブル'});
    const rows=await searchByQrPayload('BX-ABCD0001');
    expect(rows).toHaveLength(2);
    expect(rows.every((r:any)=>r.kind==='item')).toBe(true);
    expect(rows.map((r:any)=>r.item.id)).toEqual(['I1','I2']);
  });
  it('LIB_SEARCH-TC-03: 空のBoxをQR検索した場合は空の検索結果を返す',async()=>{
    boxes.push({id:'B1',code:'BX-ABCD0001',name:'空箱'});
    expect(await searchByQrPayload('BX-ABCD0001')).toEqual([]);
  });
  it('LIB_SEARCH-TC-04: 未登録Box.codeは未登録結果を返す',async()=>{
    expect(await searchByQrPayload('BX-ZZZZ0001')).toEqual([{kind:'unregistered',code:'BX-ZZZZ0001'}]);
  });
});