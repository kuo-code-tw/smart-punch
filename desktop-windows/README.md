# 79號碼頭雲端智慧系統 — Windows 原版視窗

本資料夾只增加 Windows **開啟工具**，並 **未更動** 任何原有網站、Google Apps Script、考勤、排班、員工、請假、船舶、Bundle 或正式雲端資料。

- Windows 10/11 64-bit，需已安裝 Microsoft Edge 和能連上正式網站。
- 直接執行 Port79_Windows.exe，即以 Edge \`--app=\` 模式開啟 https://kuo-code-tw.github.io/smart-punch/ ，是同一個正式網站而非仿製畫面。
- 專用 Edge 個人資料夾：\`%LOCALAPPDATA%\Port79CloudSystem\EdgeProfile\`。避免更動既有 Chrome/Edge 設定及快取；第一次開啟需重新登入。Edge 會在此資料夾保留站台產生的本機資料。
- 正式雲端寫入只透過網站原有功能與權限。此啟動工具不包含任何自動資料寫入、搬移、同步、備份或背景上傳程式。
- 離線時不保證可開啟網站，亦未提供離線寫入及自動衝突合併；本機快取 **不等於** 完整備份。
- 關閉 Edge 視窗即離開程式，無另外常駐背景服務。
- 若正式網站更新，程式下次開啟時會顯示正式網站新版，exe 不需重新包裝；此工具沒有自動更新功能。
- 未進行正式帳號或正式資料寫入測試；禁止用正式資料測試離線寫入。

## 建置與測試

\`\`\`powershell
cd desktop-windows
go test ./...
go vet ./...
go build -ldflags="-H windowsgui -s -w" -o Port79_Windows.exe .
\`\`\`

本專案的 GitHub Actions 在 Windows runner 進行原生編譯與單元測試，並提供建置產物。若有正式資料、權限、排班問題，應於原系統修正，而不是在 Windows 開啟工具中暗改計算。
