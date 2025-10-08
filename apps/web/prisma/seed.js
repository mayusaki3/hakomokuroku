// apps/web/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();
const now = () => new Date();

// 既定タグ（必要に応じて編集）
const DEFAULT_BOX_TAGS = [
  '引越し', '保管', '季節物', '頻出', '長期保管', '処分検討', '重要',
];
const DEFAULT_ITEM_TAGS = [
  '衣類', '書籍', '食器', 'キッチン', '文具', '工具', 'ケーブル',
  '電気・ガジェット', '趣味', '思い出', 'ゲーム', 'おもちゃ',
  '寝具', '洗面・衛生', '雑貨',
];

async function upsertTag(name, kind) {
  await prisma.tag.upsert({
    where: { name_kind: { name, kind } },
    update: { enabled: true }, // 再 seed 時は有効化
    create: {
      id: randomUUID(),
      name,
      kind,               // 'BOX' | 'ITEM' | 'SHARED'
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
  });
}

async function main() {
  // 仮置き箱（必要に応じて運用）
  await prisma.box.upsert({
    where: { id: 'UNASSIGNED' },
    update: {},
    create: {
      id: 'UNASSIGNED',
      code: 'UNASSIGNED',
      name: '仮置き箱',
      createdAt: now(),
      updatedAt: now(),
    },
  });

  for (const n of DEFAULT_BOX_TAGS)  await upsertTag(n, 'BOX');
  for (const n of DEFAULT_ITEM_TAGS) await upsertTag(n, 'ITEM');

  console.log('Seed done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
