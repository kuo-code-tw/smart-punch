# 管理頁整合續接驗證（2026-10-16）

基準：53fa9d1518abfa1c8f87474bff23dc1712a09c27。

## 本次修正

僅調整 integration-test/management-link.js 與測試；正式管理頁及員工打卡程式未修改。

- 離開管理頁時，取消尚在進行的跨系統 GET，並讓頁面版本失效。即使底層不理會取消，舊回應也不能套用。
- 進入瀏覽器上一頁／下一頁快取時保留待處理通知，恢復頁面後重新讀取；完整離開時釋放事件監聽及連線。
- 清理連線後忽略晚到的寫入 ACK，避免再次透過 localStorage 或 BroadcastChannel 發送通知。
- 修復既有 seven-cache-queue 測試遺漏的佇列暫存及通知函式依賴；修復 attendance-import-overtime 的加班快取案例未更新員工權限／班表邊界設定。沒有放寬原斷言。
- 增加 PR 測試流程，不含部署步驟。

## 驗證

修正前新增測試重現三項失敗：晚到 ACK、完整離頁未取消 GET、往返快取未取消 GET。修正後：

| 測試 | 結果 | 範圍 |
| --- | --- | --- |
| management-link | 13 / 13 | 通知去重、編輯延後、並行通知、未確認回應、快取拒用、身分變更、離頁及返回 |
| seven-cache-queue | 23 / 23 | 本機 VM 佇列與快取隔離 |
| attendance-core-boot | 通過 | 本機核心啟動 |
| attendance-import-overtime | 14 / 14 | 合成資料、匯入核對與加班快取 |

以上皆為合成資料及本機 VM，不是實際登入後的雲端整合驗收。七個隔離頁的 inline JavaScript 已檢查語法。

## 上線阻擋與後續

實際開啟 GitHub Pages 的 integration-test/history-data/，顯示「目前登入狀態沒有『歷史資料』查詢權限」，讀取按鈕停用，測試狀態為「等待管理員驗證」。目前尚無可用的管理員驗證狀態，沒有繞過權限。

尚須管理員登入後逐頁完成通知→實際端點 GET→畫面套用，以及編輯保護、月份切換、跨分頁與頁面離開的瀏覽器驗收。未進行正式寫入，尚未將整合功能接入正式頁。

廣泛執行舊測試另有五個未解決項目：attendance-export-month（舊測試抽取器不接受目前 async 匯出函式）、attendance-month-view（範圍檢視預期與目前實作不同）、vessel-save-queue（失敗儲存案例預期佇列 1、實際 0，原因未定）、vessel-speed（須提供變更前 HTML 基準才能執行差異測試）、workhours-edit-readback（測試缺 employees 等依賴）。這些尚未宣稱通過；完成需求核對與測試修復前不能宣稱所有系統驗收完畢。

請勿將本分支測試成功視為七系統全數實際驗收通過；正式發布須等上述阻擋解除。
