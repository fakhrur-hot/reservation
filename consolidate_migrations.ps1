# Consolidate and Clean Migrations

$migrationsDir = "src/migrations"
$files = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

$consolidatedSchema = "-- ALPHA FULL STAGE CONSOLIDATED SCHEMA`r`n`r`n"

foreach ($file in $files) {
    if ($file.Name -eq "002_seed_defaults.sql") { continue }
    $content = Get-Content -Path $file.FullName -Raw
    $consolidatedSchema += "-- FILE: $($file.Name)`r`n$content`r`n`r`n"
}

$consolidatedSchemaPath = Join-Path $migrationsDir "001_initial_schema.sql"
Set-Content -Path $consolidatedSchemaPath -Value $consolidatedSchema -Encoding UTF8
Write-Host "Created 001_initial_schema.sql"

$seedBaselinePath = Join-Path $migrationsDir "002_initial_seeds.sql"
Copy-Item -Path (Join-Path $migrationsDir "002_seed_defaults.sql") -Destination $seedBaselinePath -Force
Write-Host "Created 002_initial_seeds.sql"

# Remove all other SQL files
foreach ($file in $files) {
    Remove-Item -Path $file.FullName -Force
    Write-Host "Removed: $($file.Name)"
}
