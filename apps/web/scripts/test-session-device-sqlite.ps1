$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$db = Join-Path (Get-Location) 'prisma/session-device-integration.db'
$previous = $env:DATABASE_URL
try {
    if (Test-Path $db) { throw "Refusing to overwrite existing integration DB: $db" }
    $env:DATABASE_URL = 'file:./session-device-integration.db'
    & npx.cmd prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
    & npx.cmd prisma generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
    & npx.cmd vitest run tests/session-device.sqlite.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'SQLite integration tests failed' }
}
finally {
    $env:DATABASE_URL = $previous
    if (Test-Path $db) { Remove-Item $db -Force }
    foreach ($suffix in @('-journal', '-wal', '-shm')) {
        if (Test-Path "$db$suffix") { Remove-Item "$db$suffix" -Force }
    }
}
