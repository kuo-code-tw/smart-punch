# AQC 多桿作業雲端串接

此變更新增獨立 `AQC多桿作業紀錄` 工作表，使用追加事件作為唯一正式來源。事件包含伺服器確認的修改人、時間、操作 ID、版本及修改前後內容；刪除是保留原內容的 tombstone。原船舶主檔、櫃數、員工權限及請款統計不寫入。

## 部署順序

1. 從實際使用中的 GAS 專案匯出完整 `程式碼.gs` 並備份。不可用舊版全文覆蓋後續變更。
2. 執行 `node scripts/apply-gas-aqc-cloud.cjs LIVE_Code.gs PATCHED_Code.gs`。工具僅插入兩個具名接口、附加本模組並更新版本；未知來源錨點或重複安裝會拒絕。
3. 將輸出完整檔套用到同一個 GAS 主檔，保存、讀回比對。`backend/aqc-multi-rod.gs` 已由工具附加，不得再次當成另一個檔案貼入造成重複宣告。
4. 在獨立測試試算表實測新增、讀回、第二個授權帳號讀取、版本衝突、相同操作重試、修改與刪除留痕，再更新原 WebApp 的部署版本。沿用原執行身分和網址，不新增公開權限。
5. 確認 API 版本 `2026.10.28.V63-AQC-MULTI-ROD-CLOUD`，再合併前端 PR 並確認 Pages 更新。正式瀏覽器仍需登入後實測，不可以單靠 HTTP 200 宣稱通過。

## 接口與權限

- GET `gcGetAqcMultiRod`：效率 `view` 和 `records.view`。`revision` 相同時僅回版本；`meta=1` 僅回版本。`export=1` 另驗 `records.export`。
- POST `gcSaveAqcMultiRod`：效率 `manage`，依新增／修改／刪除驗證 `records.create`／`records.edit`／`records.delete`。使用現有登入 Token，沿用指定職稱範圍尚未支援時禁止讀取的既有安全限制。
- 寫入需 `record`、`operation`、整數 `expectedVersion` 及唯一 `mutationId`。使用 ScriptLock 原子比對版本、追加單一事件、flush、讀回核對。相同帳號相同操作重試不重複追加；舊版本不能覆寫新版本或復活已刪除紀錄。
- 時間以台灣當地 `YYYY-MM-DDTHH:mm` 儲存，嚴格檢查真實日期、跨日與尚未結束狀態。

## 本機資料與快取

- 舊 `p79-aqc-multi-rod-v1:<帳號>` 資料永不清除。授權者可按「匯入此帳號舊本機紀錄」，保留原 ID；相同 ID 不覆寫。中斷後可再次匯入，已確認者會略過。已刪除 ID 匯入會被伺服器拒絕，避免舊資料復活。
- 雲端快取依帳號、部署與權限範圍隔離。先顯示快取再用專屬版本比對；未變更不下載全資料。
- 只有單筆收據時，不把它當成完整集合的最新版本；之後仍補齊其他管理者的異動。切換帳號、權限及晚到的讀取回應受到隔離。
- 雲端錯誤時保留表單及操作 ID，不顯示儲存成功；顯示快取時清楚標明未確認最新資料。

## 驗證界線

`tests/aqc-multi-rod-cloud.cjs` 為隔離試算表模型及權限驗證器測試；`tests/aqc-multi-rod-client.cjs` 執行實際前端程式並模擬 DOM／API。這些測試不能替代正式 GAS 部署與真實帳號的跨電腦驗證。
