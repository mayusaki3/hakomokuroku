// apps/web/src/lib/codegen.ts
export function newBoxCode(prefix = 'BX-') {
  // 例: BX-2KJ6-9XH3
  const t = Date.now().toString(36).slice(-5).toUpperCase();
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}${t}-${r}`;
}
