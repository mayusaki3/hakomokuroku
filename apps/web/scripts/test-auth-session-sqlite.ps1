$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$db = Join-Path (Get-Location) 'prisma/auth-session-integration.db'
$previous = $env:DATABASE_URL
try {
    if (Test-Path $db) { throw "Refusing to overwrite existing integration DB: $db" }
    $env:DATABASE_URL = 'file:./auth-session-integration.db'
    & npx prisma db push --skip-generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma db push failed' }
    & npx vitest run tests/auth-session.sqlite.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'SQLite integration tests failed' }
}
finally {
    $env:DATABASE_URL = $previous
    if (Test-Path $db) { Remove-Item $db -Force }
    foreach ($suffix in @('-journal', '-wal', '-shm')) {
        if (Test-Path "$db$suffix") { Remove-Item "$db$suffix" -Force }
    }
}
