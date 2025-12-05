// apps/web/tests/lib.db.spec.ts
// hakomokuroku ローカルDB (Dexie) 用ユニットテスト
// 対象: apps/web/src/lib/db.ts
// テスト番号: LIB_DB_LOCAL-TC-01 〜 LIB_DB_LOCAL-TC-16

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Dexie をモックして、IndexedDB 依存をなくす
vi.mock('dexie', () => {
  /**
   * 単純なインメモリ Table 実装
   * - records: レコード配列
   * - get/add/delete/update
   * - where().equals().first()/delete()/modify()
   * - where().anyOf().modify()
   */
  class FakeTable<T extends { id: string }> {
    records: T[] = [];

    // 主キーで1件取得
    async get(id: string): Promise<T | undefined> {
      return this.records.find((r) => r.id === id);
    }

    // 追加
    async add(obj: T): Promise<string> {
      this.records.push(obj);
      return obj.id;
    }

    // 主キー削除
    async delete(id: string): Promise<void> {
      this.records = this.records.filter((r) => r.id !== id);
    }

    // 部分更新
    async update(id: string, patch: Partial<T>): Promise<number> {
      const idx = this.records.findIndex((r) => r.id === id);
      if (idx < 0) return 0;
      this.records[idx] = { ...(this.records[idx] as any), ...(patch as any) } as T;
      return 1;
    }

    /**
     * where 句
     * - .equals(value).first()/delete()/modify()
     * - .anyOf(values).modify()
     */
    where(field: keyof T | string) {
      const self = this;

      const selectEquals = (value: any): T[] => {
        return self.records.filter((r) => (r as any)[field as string] === value);
      };

      const selectAnyOf = (values: any[]): T[] => {
        if (field === 'id') {
          return self.records.filter((r) => values.includes((r as any).id));
        }
        return self.records.filter((r) => values.includes((r as any)[field as string]));
      };

      return {
        equals(value: any) {
          const matches = selectEquals(value);
          return {
            async first(): Promise<T | undefined> {
              return matches[0];
            },
            async delete(): Promise<void> {
              self.records = self.records.filter((r) => !matches.includes(r));
            },
            async modify(fn: (obj: T) => void): Promise<void> {
              matches.forEach((obj) => fn(obj));
            },
          };
        },
        anyOf(values: any[]) {
          const matches = selectAnyOf(values);
          return {
            async modify(fn: (obj: T) => void): Promise<void> {
              matches.forEach((obj) => fn(obj));
            },
          };
        },
      };
    }
  }

  /**
   * Dexie 風の DB 本体モック
   * - version().stores() は何もしない
   * - delete()/open() は配列を初期化
   * - transaction(mode, ...tables, cb) は cb() を直接実行
   */
  class FakeDexie {
    boxes = new FakeTable<any>();
    items = new FakeTable<any>();
    boxLocations = new FakeTable<any>();
    tags = new FakeTable<any>();

    constructor(_name: string) {}

    version(_v: number) {
      return {
        stores: (_schema: any) => {
          // 本物の Dexie と同様に、version().stores() が呼ばれたタイミングで
          // テーブルを初期化する（HKDB コンストラクタから呼ばれる想定）
          this.boxes = new FakeTable<any>();
          this.items = new FakeTable<any>();
          this.boxLocations = new FakeTable<any>();
          this.tags = new FakeTable<any>();
          return this;
        },
      };
    }

    async delete(): Promise<void> {
      this.boxes.records = [];
      this.items.records = [];
      this.boxLocations.records = [];
      this.tags.records = [];
    }

    async open(): Promise<this> {
      return this;
    }

    async transaction(_mode: string, ...args: any[]): Promise<any> {
      const cb = args[args.length - 1] as () => any | Promise<any>;
      return await cb();
    }
  }

  return {
    default: FakeDexie,
    Table: FakeTable,
  };
});

// Dexie モックを定義した後で db モジュールを読み込む
import {
  db,
  getBox,
  ensureUnassignedBox,
  removeBox,
  findBoxByCodeOrId,
  moveItem,
  moveItems,
  UNASSIGNED_BOX_ID,
  type Box,
  type Item,
} from '@/lib/db';

// 各テスト前に DB をリセット
beforeEach(async () => {
  if ((globalThis as any).__hkdbReset) {
    await (globalThis as any).__hkdbReset();
  }
});

describe('lib/db (Dexie ラッパー)', () => {
  /**
   * LIB_DB_LOCAL-TC-01: ensureUnassignedBox で 仮置き箱 を作成できるか
   */
  it('LIB_DB_LOCAL-TC-01: ensureUnassignedBox で 仮置き箱 を作成できる', async () => {
    const before = await db.boxes.get(UNASSIGNED_BOX_ID);
    expect(before).toBeUndefined();

    await ensureUnassignedBox();

    const box = await db.boxes.get(UNASSIGNED_BOX_ID);
    expect(box).toBeDefined();
    expect((box as Box).id).toBe(UNASSIGNED_BOX_ID);
  });

  /**
   * LIB_DB_LOCAL-TC-02: ensureUnassignedBox は二回呼んでも重複作成しない
   */
  it('LIB_DB_LOCAL-TC-02: ensureUnassignedBox は idempotent', async () => {
    await ensureUnassignedBox();
    const first = await db.boxes.get(UNASSIGNED_BOX_ID);
    expect(first).toBeDefined();

    await ensureUnassignedBox();
    const second = await db.boxes.get(UNASSIGNED_BOX_ID);
    expect(second).toBeDefined();
    // 同一オブジェクトかどうかまでは問わないが、少なくとも 2 回目も正常終了すること
    expect((second as Box).id).toBe(UNASSIGNED_BOX_ID);
  });

  /**
   * LIB_DB_LOCAL-TC-03: getBox は boxes.get の結果を返す
   */
  it('LIB_DB_LOCAL-TC-03: getBox は boxes.get の結果を返す', async () => {
    await ensureUnassignedBox();
    const box = await getBox(UNASSIGNED_BOX_ID);
    expect(box).toBeDefined();
    expect((box as Box).id).toBe(UNASSIGNED_BOX_ID);
  });

  /**
   * LIB_DB_LOCAL-TC-04: removeBox は 仮置き箱 を削除しようとすると例外
   */
  it('LIB_DB_LOCAL-TC-04: removeBox(UNASSIGNED) は例外', async () => {
    await ensureUnassignedBox();
    await expect(removeBox(UNASSIGNED_BOX_ID)).rejects.toThrow('仮置き箱は削除できません');
  });

  /**
   * LIB_DB_LOCAL-TC-05: removeBox は items を仮置き箱に移動し、BoxLocation と Box を削除する
   */
  it('LIB_DB_LOCAL-TC-05: removeBox は items を仮置き箱に移動し box を削除', async () => {
    await ensureUnassignedBox();
    const now = new Date().toISOString();

    // 対象箱 B1
    const b1: Box = {
      id: 'B1',
      code: 'B1',
      name: '箱1',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(b1);

    // B1 配下の Item
    const it1: Item = {
      id: 'I1',
      boxId: 'B1',
      name: 'アイテム1',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.items.add(it1);

    // B1 の BoxLocation
    await db.boxLocations.add({
      id: 'L1',
      boxId: 'B1',
      thumbs: [],
      note: null,
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // 削除実行
    await removeBox('B1');

    // アイテムは仮置き箱へ
    const moved = await db.items.get('I1');
    expect(moved).toBeDefined();
    expect((moved as Item).boxId).toBe(UNASSIGNED_BOX_ID);

    // BoxLocation は削除
    const loc = await db.boxLocations.get('L1');
    expect(loc).toBeUndefined();

    // 箱 B1 自体も削除
    const box = await db.boxes.get('B1');
    expect(box).toBeUndefined();
  });

  /**
   * LIB_DB_LOCAL-TC-06: findBoxByCodeOrId は key が空なら null
   */
  it('LIB_DB_LOCAL-TC-06: findBoxByCodeOrId 空文字/undefined/null なら null', async () => {
    await ensureUnassignedBox();

    await expect(findBoxByCodeOrId(null)).resolves.toBeNull();
    await expect(findBoxByCodeOrId('')).resolves.toBeNull();
    await expect(findBoxByCodeOrId('   ')).resolves.toBeNull();
  });

  /**
   * LIB_DB_LOCAL-TC-07: findBoxByCodeOrId は id でヒットする場合 id 優先
   */
  it('LIB_DB_LOCAL-TC-07: findBoxByCodeOrId は id 直指定でヒット', async () => {
    const now = new Date().toISOString();
    const box: Box = {
      id: 'BOX1',
      code: 'CODE1',
      name: '箱IDテスト',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(box);

    const found = await findBoxByCodeOrId('BOX1');
    expect(found).not.toBeNull();
    expect((found as Box).id).toBe('BOX1');
  });

  /**
   * LIB_DB_LOCAL-TC-08: findBoxByCodeOrId は id で見つからず code でヒットする場合も取得
   */
  it('LIB_DB_LOCAL-TC-08: findBoxByCodeOrId は code でもヒット', async () => {
    const now = new Date().toISOString();
    const box: Box = {
      id: 'BOX2',
      code: 'CODE2',
      name: '箱CODEテスト',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(box);

    // "CODE2" を id としては持たないが、code として一致する
    const found = await findBoxByCodeOrId('CODE2');
    expect(found).not.toBeNull();
    expect((found as Box).id).toBe('BOX2');
  });

  /**
   * LIB_DB_LOCAL-TC-09: findBoxByCodeOrId は見つからない場合 null
   */
  it('LIB_DB_LOCAL-TC-09: findBoxByCodeOrId は見つからない場合 null', async () => {
    const found = await findBoxByCodeOrId('NO_SUCH_BOX');
    expect(found).toBeNull();
  });

  /**
   * LIB_DB_LOCAL-TC-10: moveItem は itemId / targetBoxId どちらかでも falsy なら例外
   */
  it('LIB_DB_LOCAL-TC-10: moveItem invalid args は例外', async () => {
    await expect(moveItem('', 'B1')).rejects.toThrow('invalid args');
    await expect(moveItem('I1', '')).rejects.toThrow('invalid args');
  });

  /**
   * LIB_DB_LOCAL-TC-11: moveItem は移動先箱が存在しなければ例外
   */
  it('LIB_DB_LOCAL-TC-11: moveItem は移動先箱が無ければ例外', async () => {
    // ensureUnassignedBox は内部で呼ばれるが、ここではあえて明示
    await ensureUnassignedBox();
    await expect(moveItem('I1', 'NO_BOX')).rejects.toThrow('移動先の箱が存在しません');
  });

  /**
   * LIB_DB_LOCAL-TC-12: moveItem は item が存在しなければ例外
   */
  it('LIB_DB_LOCAL-TC-12: moveItem は item 無しなら例外', async () => {
    const now = new Date().toISOString();
    const target: Box = {
      id: 'TB',
      code: 'TB',
      name: 'ターゲット箱',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(target);

    await expect(moveItem('NO_ITEM', 'TB')).rejects.toThrow('アイテムが存在しません');
  });

  /**
   * LIB_DB_LOCAL-TC-13: moveItem は同じ箱に移動する場合は no-op（更新しない）
   */
  it('LIB_DB_LOCAL-TC-13: moveItem は同じ boxId なら no-op', async () => {
    const now = new Date().toISOString();
    const box: Box = {
      id: 'B1',
      code: 'B1',
      name: '箱1',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(box);

    const item: Item = {
      id: 'I1',
      boxId: 'B1',
      name: 'アイテム1',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.items.add(item);

    const before = await db.items.get('I1');
    const result = await moveItem('I1', 'B1');

    expect(result).toBeDefined();
    expect((result as Item).boxId).toBe('B1');
    // no-op なので updatedAt も変わらない前提
    expect((result as Item).updatedAt).toBe((before as Item).updatedAt);
  });

  /**
   * LIB_DB_LOCAL-TC-14: moveItem は別箱へ移動し updatedAt を更新
   */
  it('LIB_DB_LOCAL-TC-14: moveItem は別箱へ移動し updatedAt を更新', async () => {
    // arrange
    const now = new Date().toISOString();
    const b1: Box = {
      id: 'B1',
      code: 'B1',
      name: '箱1',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const b2: Box = {
      id: 'B2',
      code: 'B2',
      name: '箱2',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(b1);
    await db.boxes.add(b2);

    const item: Item = {
      id: 'I1',
      boxId: 'B1',
      name: 'アイテム1',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now, // いったん現在時刻を入れる
    };
    await db.items.add(item);

    // ★ここで「過去の updatedAt」に上書きしておく
    const previousUpdatedAt = '2000-01-01T00:00:00.000Z';
    await db.items.update('I1', { updatedAt: previousUpdatedAt });

    const before = await db.items.get('I1');
    const beforeUpdatedAt = (before as Item).updatedAt;

    // act
    const result = await moveItem('I1', 'B2');

    // assert
    expect(result).toBeDefined();
    expect((result as Item).boxId).toBe('B2');
    // moveItem 実行後は updatedAt が previousUpdatedAt とは異なる値になっているはず
    expect((result as Item).updatedAt).not.toBe(beforeUpdatedAt);
  });
  
  /**
   * LIB_DB_LOCAL-TC-15: moveItems は itemIds が空なら 0 を返す
   */
  it('LIB_DB_LOCAL-TC-15: moveItems は itemIds 空なら 0', async () => {
    const count = await moveItems([], 'B1');
    expect(count).toBe(0);
  });

  /**
   * LIB_DB_LOCAL-TC-16: moveItems は移動先箱が存在しなければ例外
   */
  it('LIB_DB_LOCAL-TC-16: moveItems は移動先箱が無ければ例外', async () => {
    await ensureUnassignedBox();
    await expect(moveItems(['I1'], 'NO_BOX')).rejects.toThrow('移動先の箱が存在しません');
  });

  /**
   * LIB_DB_LOCAL-TC-17: moveItems は複数アイテムを正常移動し、既に同じ箱にあるものはカウントしない
   */
  it('LIB_DB_LOCAL-TC-17: moveItems は複数アイテムを正常移動し count を返す', async () => {
    const now = new Date().toISOString();

    const b1: Box = {
      id: 'B1',
      code: 'B1',
      name: '箱1',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const b2: Box = {
      id: 'B2',
      code: 'B2',
      name: '箱2',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.boxes.add(b1);
    await db.boxes.add(b2);

    const i1: Item = {
      id: 'I1',
      boxId: 'B1',
      name: 'アイテム1',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const i2: Item = {
      id: 'I2',
      boxId: 'B2',
      name: 'アイテム2',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const i3: Item = {
      id: 'I3',
      boxId: 'B1',
      name: 'アイテム3',
      tags: [],
      note: null,
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.items.add(i1);
    await db.items.add(i2);
    await db.items.add(i3);

    const count = await moveItems(['I1', 'I2', 'I3'], 'B2');
    // I1, I3 の 2 件が移動対象 (I2 は元々 B2 のため count されない) 想定
    expect(count).toBe(2);

    const r1 = await db.items.get('I1');
    const r2 = await db.items.get('I2');
    const r3 = await db.items.get('I3');

    expect((r1 as Item).boxId).toBe('B2');
    expect((r2 as Item).boxId).toBe('B2');
    expect((r3 as Item).boxId).toBe('B2');
  });
});
