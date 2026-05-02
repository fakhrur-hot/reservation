# Cleanup Script for Alpha Full Stage

$itemsToRemove = @(
    "client/qitchen-portal",
    "menu_pages",
    "scratch",
    "dist",
    "extract_pages.py",
    "ocr_easyocr.py",
    "ocr_pages.py",
    "ocr_win.py",
    "read_pdf.py",
    "win_ocr.ps1",
    "menu_sample.pdf",
    "payload.json",
    "build_output.txt",
    "test-output.txt",
    "Qitchen Portal Redesign.txt"
)

foreach ($item in $itemsToRemove) {
    if (Test-Path $item) {
        Remove-Item -Path $item -Recurse -Force
        Write-Host "Removed: $item"
    }
}

$docsArchive = "docs/archive"
if (-not (Test-Path $docsArchive)) {
    New-Item -ItemType Directory -Path $docsArchive
}

$mdFilesToMove = @(
    "ADMIN_ENHANCEMENTS_SUMMARY.md",
    "BACKEND_ENDPOINTS_SUMMARY.md",
    "CRITICAL_FIXES_SUCCESS_REPORT.md",
    "FLOOR_PLAN_WATERMARK_DESIGN.md",
    "INFRASTRUCTURE_TESTING_FINAL_REPORT.md",
    "NOTIFICATION_ALERT_IMPLEMENTATION_SUMMARY.md",
    "QUICK_FIX_GUIDE.md",
    "README_TESTING_STATUS.md",
    "ROUND2_IMPROVEMENTS_SUMMARY.md",
    "SEJIWA_INITIALIZATION_SUMMARY.md",
    "SEJIWA_QUICK_REFERENCE.md",
    "SEJIWA_README.md",
    "SETUP_CACHE_FIX.md",
    "SETUP_PAGE_PREFILL_SUMMARY.md",
    "TASK_1_3_IMPLEMENTATION_SUMMARY.md",
    "TASK_1_3_VERIFICATION.md",
    "TASK_1_4_IMPLEMENTATION_SUMMARY.md",
    "TASK_1_4_VERIFICATION.md",
    "TESTING_INFRASTRUCTURE_RESULTS.md",
    "TESTING_QUICK_REFERENCE.md",
    "WATERMARK_IMPLEMENTATION_COMPLETE.md"
)

foreach ($file in $mdFilesToMove) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination $docsArchive -Force
        Write-Host "Moved to archive: $file"
    }
}
