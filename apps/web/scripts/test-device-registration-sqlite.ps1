$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$db = Join-Path (Get-Location) 'prisma/device-registration-integration.db'
$previous = $env:DATABASE_URL
try {
    if (Test-Path $db) { throw "Refusing to overwrite existing integration DB: $db" }
    $env:DATABASE_URL = 'file:./device-registration-integration.db'
    & pnpm exec prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
    & pnpm exec prisma generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
    & pnpm exec vitest run tests/device-registration.sqlite.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'Device registration SQLite tests failed' }
}
finally {
    $env:DATABASE_URL = $previous
    if (Test-Path $db) { Remove-Item $db -Force }
    foreach ($suffix in @('-journal', '-wal', '-shm')) {
        if (Test-Path "$db$suffix") { Remove-Item "$db$suffix" -Force }
    }
}
