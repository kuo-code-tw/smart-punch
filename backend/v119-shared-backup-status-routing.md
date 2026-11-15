# PORT79 V119｜跨電腦共用系統備份時間

此變更的前端已加入正式 GitHub Pages 的 index.html，後端仍需合併到 **目前正式** Apps Script（不可用 V114 覆蓋 V118 或後續版本）。

## 需要部署的唯一伺服端入口

在正式 Apps Script 專案加入 `backend/v119-shared-backup-status.gs` 的函式 `p79AllBackupStatus_(params)`，並在既有 `doGet(e)` action 路由中新增：

```javascript
if(action==='historyBackupStatus'){
  try{return jsonOutput(p79AllBackupStatus_(params));}
  catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}
}
```

* 不更動既有 `historyBackupCapabilities`、`historyBackupMonth`、登入或其他路由。
* GET 要先通過 `p79HistoryBackupSession_` 最高管理員授權；禁止匿名查詢。
* 從 Apps Script 的共享 Script Properties 讀取 `P79_ALL_BACKUP_LAST_<type>`。不同電腦、同一套系統看到同一份紀錄。
* 只有 `verified:true` 且真實檔案在對應備份資料夾，才顯示綠燈與真實備份時間；如果沒有回條，顯示未確認而非假成功。
* 唯讀，禁止 GET 端建立備份資料夾或新檔案。原始備份紀錄不可用 `localStorage` 作為跨電腦依據。
* 使用 `Asia/Taipei` 顯示 YYYY/MM/DD HH:mm:ss。
* 請在正式部署之前與 V118 之後全部功能合併，在測試 GAS 專案驗證權限、回應格式、失效連結與跨帳號不外洩，再更新原 deployment ID 的正式版本。

## 查核

1. A 電腦成功備份船舶，雲端回條持久化。
2. B 電腦同帳號重新登入，顯示相同時間和綠燈，可開啟雲端檔案。
3. A 再次成功備份，B 切回頁面後更新時間（一般至多約 60 秒）。
4. 其餘分類逐一檢查；船期和稽核計入其他 2 項。
5. 沒有執行過備份、雲端檔案刪除、無權限、離線均不假裝成功。
6. 切換電腦和重新整理，不清除已確認的共用時間紀錄。

本檔為程式部署說明，不代表正式 GAS 已更新。
