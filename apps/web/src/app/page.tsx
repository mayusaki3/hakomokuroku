export default function Home() {
    return (
        <main style={{ padding: 24 }}>
        <h1>hakomokuroku</h1>
        <p>箱の目録・QRラベル管理（MVP雛形）</p>
        <ul>
        <li>アイテム先撮り → 箱確定＆QR発行 → 箱外観撮影</li>
        <li>IndexedDB に保存（オフライン/PWA）</li>
        <li>QR（SVG）生成・面付けPDF（近日）</li>
        </ul>
        </main>
    );
}
