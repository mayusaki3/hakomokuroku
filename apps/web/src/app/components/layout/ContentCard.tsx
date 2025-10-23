// コンテンツ枠: 角丸/枠線/背景はテーマ変数で一元管理
export default function ContentCard({ as: Tag = 'section', className = '', ...props }: any) {
  const cls = `content-card ${className}`.trim();
  return <Tag className={cls} {...props} />;
}
