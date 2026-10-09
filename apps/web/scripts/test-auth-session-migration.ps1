$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$db = Join-Path (Get-Location) 'prisma/auth-migration-existing-test.db'
$temp = Join-Path (Get-Location) 'prisma/.auth-migration-baseline'
$previous = $env:DATABASE_URL

function Assert-Success([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)" }
}

try {
    if ((Test-Path $db) -or (Test-Path $temp)) {
        throw 'Refusing to overwrite an existing migration test database or staging folder'
    }
    $env:DATABASE_URL = 'file:../auth-migration-existing-test.db'
    New-Item -ItemType Directory -Path (Join-Path $temp 'migrations') -Force | Out-Null
    Copy-Item 'prisma/schema.prisma' (Join-Path $temp 'schema.prisma')
    Copy-Item 'prisma/migrations/migration_lock.toml' (Join-Path $temp 'migrations/migration_lock.toml')
    foreach ($name in @('20261005092527_init_v0_8', '20261008172500_add_auth_session')) {
        Copy-Item (Join-Path 'prisma/migrations' $name) (Join-Path $temp 'migrations') -Recurse
    }

    & npx.cmd prisma migrate deploy --schema (Join-Path $temp 'schema.prisma')
    Assert-Success 'Baseline migration'
    & npx.cmd prisma db execute --schema (Join-Path $temp 'schema.prisma') --file (Join-Path $PSScriptRoot 'fixtures/auth-session-before-device.sql')
    Assert-Success 'Baseline fixture'
    $env:DATABASE_URL = 'file:./auth-migration-existing-test.db'
    & npx.cmd prisma migrate deploy --schema prisma/schema.prisma
    Assert-Success 'Device link migration'
    & npx.cmd prisma generate
    Assert-Success 'Prisma client generation'
    & npx.cmd vitest run tests/auth-session.migration.sqlite.spec.ts
    Assert-Success 'Existing session migration verification'
}
finally {
    $env:DATABASE_URL = $previous
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
    if (Test-Path $db) { Remove-Item $db -Force }
    foreach ($suffix in @('-journal', '-wal', '-shm')) {
        if (Test-Path "$db$suffix") { Remove-Item "$db$suffix" -Force }
    }
}
