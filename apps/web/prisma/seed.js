// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  // 1) 開発用ユーザー（ログインID: dev）を用意
  const devUser = await prisma.user.upsert({
    where: { userId: 'dev' },
    update: {},
    create: {
      id: 'U_LOCAL', // 固定でもOK（重複時は消す）
      userId: 'dev',
      userName: '開発用ユーザー',
      // まだ認証未実装なら仮文字列でOK（将来argon2idに置換）
      passwordHash: 'dev',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // 2) 未割当箱（ユーザー必須）
  await prisma.box.upsert({
    where: { id: 'UNASSIGNED' },
    update: {},
    create: {
      id: 'UNASSIGNED',
      code: 'UNASSIGNED',
      name: '未割当',
      location: '未設定',
      tags: [], // JSON 配列（schema は Json?）
      thumbs: [], // JSON 配列
      meta: {},
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
      // ★必須：ユーザー関連を connect
      user: { connect: { id: devUser.id } },
    },
  });

  // 3) 初期タグ（ユーザー専用）— SQLite は skipDuplicates 非対応のため upsert で投入
  const tags = [
    {
      id: 't-storage',
      userId: devUser.id,
      name: '保管',
      kind: 'BOX',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 't-fragile',
      userId: devUser.id,
      name: '割れ物',
      kind: 'SHARED',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 't-electro',
      userId: devUser.id,
      name: '電気',
      kind: 'ITEM',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const t of tags) {
    await prisma.tag.upsert({
      where: { id: t.id },
      update: { ...t },
      create: t,
    });
  }

  // 4) 画像認識（LLM）初期設定：UserSetting
  await prisma.userSetting.upsert({
    where: { userId: devUser.id },
    update: {
      visionProvider: 'none',
      visionPromptName: '画像中央に映っている物体の名前を[name:{名前}]形式で応答。',
      visionPromptTags:
        '次行に挙げるタグリストから、画像中央に映っている物体が該当するTagのみを[tag:{タグ1},{タグ2}...]形式で応答。\n' +
        '[タグリスト:$tags]',
      visionPromptNote: '画像中央に映っている物体の特徴を[memo:{メモ}]形式で応答。',
    },
    create: {
      userId: devUser.id,
      visionProvider: 'none',
      visionPromptName: '画像中央に映っている物体の名前を[name:{名前}]形式で応答。',
      visionPromptTags:
        '次行に挙げるタグリストから、画像中央に映っている物体が該当するTagのみを[tag:{タグ1},{タグ2}...]形式で応答。\n' +
        '[タグリスト:$tags]',
      visionPromptNote: '画像中央に映っている物体の特徴を[memo:{メモ}]形式で応答。',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
