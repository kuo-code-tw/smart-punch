# 登入等待與手機考勤核對修正（2026-11-05）

## 已確認的程式問題

首頁 fetchTimeout 原本在收到 HTTP headers 後就移除逾時計時；readJson 讀取完整 body 不再受同一 deadline 約束。管理登入遇到逾時或明確拒絕仍會另送 verifyUser 備援，增加負載及等待。改為包括 response body 的單次 deadline，現行 verifyAdmin 最多 25 秒；只有明確 unknown/unsupported action 才使用舊版相容路徑，密碼錯誤、忙碌或逾時均不自動重送。停止輸入密碼時的額外身分預熱。

手機打卡前原本要求 getAttendanceMainDirect 取得整公司當月資料並進行員工身分 enrichment，之後才在手機選出本人。前端新增相容參數 punchSelf=1；既有 V97 忽略此參數仍沿用舊讀取。後端 V98 guarded patch 要求有效 Token，從 Token 取得本人身分，在主表解析前篩選本人，原始保護紀錄也篩選相同身分，省去全公司 enrichment 與回傳。主表原始範圍仍須讀取，不宣稱完全移除 Sheets IO 或保證立即完成。

## 範圍與狀態

不變更上下班序列、GPS、裝置綁定、正式雲端 ACK、待傳佇列、原始保護及刪除標記。沒有以模擬員工打卡新增正式紀錄。V97 的短編輯鎖使用 UserLock，既有即時打卡亦使用 UserLock，因此不可宣稱兩者完全獨立；本次尚無執行紀錄證明該鎖是使用者截圖逾時的直接原因。

前端修正及 V98 後端 patch 已完成隔離測試。正式 GAS 目前登入已登出，V98 尚未部署，必須重新登入後比對正式最新主程式、套用且更新原部署，再驗證本人讀取與前端。不能據此宣稱員工打卡已全面恢復。

## 驗證

- tests/punch-login-deadline.cjs：headers 已回 body 不回、完全不回、成功、密碼錯誤、忙碌、不支援 action 與 inline 語法。
- tests/punch-self-read.cjs：缺 Token 拒絕、從 Token 限本人、忽略指定他人 ID、同考勤號不同姓名拒絕、保留配對欄位、原始保護合併、正式主表優先、刪除標記、舊 API 相容。
- tests/mobile-punch-session.cjs、tests/punch-device-state.cjs：本人權杖續期、權限拒絕、身分切換、錯月份、並行讀取及綁定檢查回歸通過。
- V98 完整準備來源通過 JavaScript syntax parse；完整來源未公開提交。
