# 79號碼頭 Windows 輕量資料夾版（首次登入後才下載私人資料）

這個專案使用 Microsoft Edge WebView2 Runtime 和 Windows .NET Framework 4.8，而非將整個 Electron / Chromium 一起打包。適合 Windows 10／11 x64 及已安裝 WebView2 Runtime 的電腦。

- ZIP 僅含 Windows 主程式、必要 WebView2 程式庫、原網站公開 HTML、CSS、JavaScript 與圖片。
- 原系統程式的路徑保留在 site/smart-punch 下，例如 attendance、schedule、leave、hr、work-hours、aqc-efficiency、settings 等資料夾；打包過程檢查原始檔 SHA-256 是否相同。
- local-data/BrowserProfile、local-data/backups、local-data/updates、local-data/logs 在發佈包中都是空的。
- 第一次啟動只從本機開啟原系統登入畫面，沒有私人資料庫預載。
- 當首頁成功顯示管理員系統畫面、具有正式登入 token，且角色為 admin 或 superadmin 時才呼叫原 Port79DataCache.downloadAll()。
- 登入後進度條顯示真實完成的七大系統及考勤月份進度；不會擋住正常首頁操作。
- 視窗按 X 隱藏到系統匣，再按系統匣圖示恢復，選「真正結束」才關閉。
- 更新器只處理原網站公開程式檔；下載後用 Git Blob SHA1 比對正式原始碼及已發佈 GitHub Pages，下一次啟動才套用，不包含 local-data。更新 Windows 殼程式本身仍需下載新的 ZIP。

## 限制和驗收

本版本沒有對正式帳號或私人考勤、排班、船舶資料進行真實寫入測試。因為原網站的網域和本機 WebView2 虛擬主機網域不同，需由管理員在 Windows 實機驗證 Google Apps Script 的跨來源資料讀取與權限；若雲端拒絕，應修復 API 的正式跨來源支援，而不是停用瀏覽器安全限制。

不支援將本機快取當作完整備份，也不承諾離線修改後自動上傳。任何新增、刪除、審批、打卡或匯入都依原系統的正式雲端確認與權限流程。
