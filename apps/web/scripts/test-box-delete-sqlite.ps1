$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$db = Join-Path (Get-Location) 'prisma/box-delete-integration.db'
$previous = $env:DATABASE_URL
try {
    if (Test-Path $db) { throw "Refusing to overwrite existing integration DB: $db" }
    $env:DATABASE_URL = 'file:./box-delete-integration.db'
    & pnpm exec prisma db push --schema prisma/schema.prisma --skip-generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma db push failed' }
    & pnpm exec vitest run tests/box-delete.sqlite.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'Box delete integration tests failed' }
}
finally {
    $env:DATABASE_URL = $previous
    if (Test-Path $db) { Remove-Item $db -Force }
    foreach ($suffix in @('-journal', '-wal', '-shm')) {
        if (Test-Path "$db$suffix") { Remove-Item "$db$suffix" -Force }
    }
}
