# 登入等待與手機考勤核對修正（2026-11-05）

## 已確認的程式問題

首頁 fetchTimeout 原本在收到 HTTP headers 後就移除逾時計時；readJson 讀取完整 body 不再受同一 deadline 約束。管理登入遇到逾時或明確拒絕仍會另送 verifyUser 備援，增加負載及等待。改為包括 response body 的單次 deadline，現行 verifyAdmin 最多 25 秒；只有明確 unknown/unsupported action 才使用舊版相容路徑，密碼錯誤、忙碌或逾時均不自動重送。停止輸入密碼時的額外身分預熱。

手機打卡前原本要求 getAttendanceMainDirect 取得整公司當月資料並進行員工身分 enrichment，之後才在手機選出本人。前端新增相容參數 punchSelf=1；既有 V97 忽略此參數仍沿用舊讀取。後端 V98 guarded patch 要求有效 Token，從 Token 取得本人身分，在主表解析前篩選本人，原始保護紀錄也篩選相同身分，省去全公司 enrichment 與回傳。主表原始範圍仍須讀取，不宣稱完全移除 Sheets IO 或保證立即完成。

## 範圍與狀態

不變更上下班序列、GPS、裝置綁定、正式雲端 ACK、待傳佇列、原始保護及刪除標記。沒有以模擬員工打卡新增正式紀錄。V97 的短編輯鎖使用 UserLock，既有即時打卡亦使用 UserLock，因此不可宣稱兩者完全獨立；本次尚無執行紀錄證明該鎖是使用者截圖逾時的直接原因。

前端修正及 V98 後端 patch 已完成隔離測試。2026-11-05 已重新登入公司 Google 帳號，取得正式 V97 完整主程式，經唯一片段核對套用 V98，讀回來源與既有 guarded patch 完全一致，完整來源語法通過。原部署已成功更新至第 98 版，正式 ping 回覆 `2026.11.05.V98-PUNCH-SELF-READ`；部署 ID、公司帳號執行身分及原存取設定保留。

正式瀏覽器驗證：超級管理員登入成功；請假頁顯示 88 位人員及 11 月 24 筆請假；考勤頁顯示 11/05 共 24 班次、38 筆原始打卡；船舶頁顯示 11 月 5 艘、4365 Moves 及同步完成。V98 上線後排班成功取得編輯權，顯示雲端班表已更新及考勤燈號已同步，隨後離開排班頁。

限制：這次沒有實際送出員工手機上下班打卡，沒有新增正式測試請假或重存班表；本人讀取權杖篩選、裝置綁定、重試及逾時以隔離回歸測試核對，不能宣稱所有手機及各流程寫入皆已完成正式驗證。上方工作燈號可因背景重讀再次顯示讀取中，不能僅憑燈號認定卡住或完成。

## 驗證

- tests/punch-login-deadline.cjs：headers 已回 body 不回、完全不回、成功、密碼錯誤、忙碌、不支援 action 與 inline 語法。
- tests/punch-self-read.cjs：缺 Token 拒絕、從 Token 限本人、忽略指定他人 ID、同考勤號不同姓名拒絕、保留配對欄位、原始保護合併、正式主表優先、刪除標記、舊 API 相容。
- tests/mobile-punch-session.cjs、tests/punch-device-state.cjs：本人權杖續期、權限拒絕、身分切換、錯月份、並行讀取及綁定檢查回歸通過。
- V98 完整準備來源通過 JavaScript syntax parse；完整來源未公開提交。
