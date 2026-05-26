param(
    [string]$ProjectId = "00-no-conformidades-staging-clean",
    [int]$WaitMs = 500
)

function Invoke-TestSuite {
    param(
        [string]$Label,
        [string]$TestsPath,
        [string]$Filter = ""
    )

    Write-Host "`n=== $Label ===" -ForegroundColor Cyan

    if ([string]::IsNullOrWhiteSpace($Filter)) {
        $params = @{
            projectId = $ProjectId
            testsPath = $TestsPath
        }
    } else {
        $params = @{
            projectId = $ProjectId
            testsPath = $TestsPath
            filter = $Filter
        }
    }

    $result = dysflow_test_vba @params

    if ($null -eq $result) {
        throw "No result returned from dysflow_test_vba for '$Label'."
    }

    $failed = @($result | Where-Object { -not $_.ok })
    if ($failed.Count -gt 0) {
        Write-Host "[FAIL] $Label" -ForegroundColor Red
        $failed | ForEach-Object {
            $name = $_.procedure
            $error = $_.payload.error
            Write-Host " - $name => $error" -ForegroundColor Yellow
        }
        throw "Stopping sequence: '$Label' failed."
    }

    Write-Host "[OK] $Label" -ForegroundColor Green
    Start-Sleep -Milliseconds $WaitMs
}

# IMPORTANT: sequential execution only. No parallel test runs.
Invoke-TestSuite -Label "tests.vba.json (Test_KillSwitch)" -TestsPath "tests/tests.vba.json" -Filter "Test_KillSwitch"
Invoke-TestSuite -Label "tests.vba.json (Test_Spec007)" -TestsPath "tests/tests.vba.json" -Filter "Test_Spec007"
Invoke-TestSuite -Label "tests.vba.json (Test_E2E_EnvConfig)" -TestsPath "tests/tests.vba.json" -Filter "Test_E2E_EnvConfig"
Invoke-TestSuite -Label "tests.vba.json (Test_E2E_ConfigCore)" -TestsPath "tests/tests.vba.json" -Filter "Test_E2E_ConfigCore"
Invoke-TestSuite -Label "tests.vba.json (Test_Motivo)" -TestsPath "tests/tests.vba.json" -Filter "Test_Motivo"
Invoke-TestSuite -Label "tests.vba.json (Test_E2E_Motivo)" -TestsPath "tests/tests.vba.json" -Filter "Test_E2E_Motivo"
Invoke-TestSuite -Label "tests.vba.json (Test_Indicadores)" -TestsPath "tests/tests.vba.json" -Filter "Test_Indicadores"

Invoke-TestSuite -Label "tests.vba.e2e.json" -TestsPath "tests/tests.vba.e2e.json"
Invoke-TestSuite -Label "tests.vba.cache-readiness.json" -TestsPath "tests/tests.vba.cache-readiness.json"
Invoke-TestSuite -Label "tests.vba.cache-e2e.json" -TestsPath "tests/tests.vba.cache-e2e.json"
Invoke-TestSuite -Label "tests.vba.smoke.json" -TestsPath "tests/tests.vba.smoke.json"

Write-Host "`nAll requested suites passed. " -ForegroundColor Green
