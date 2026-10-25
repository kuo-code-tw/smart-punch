# 加班申報｜發送 Mail：正式後端部署說明

## 已完成的 GitHub 前端（2026-10-25）

- 按鈕名稱是「✉ 發送 Mail」，不限制收件人顯示名稱為「會計」。
- 先選月份，再用簡易日期選擇器挑選某一天。
- 一天不論幾位加班人員、幾筆有效申報，都**合併成一封 Mail**。只顯示該天的人數、申報筆數和時數，逐人明細預設收合，點擊才展開。
- 「＋ 新增 Mail」及「移除選取信箱」直接放在視窗內，輸入收件人名稱及電子郵件。只允許有正式管理權限的人變更，歷史寄送紀錄不因刪除信箱消失。
- 寄件完成、且後端回條讀回一致時，考勤日期才會變藍；當日有人新增加班、修改或取消，先前郵件版本失效時呈橘色提醒重新發送。
- 前端不存放任何 SMTP/Gmail 密碼或真實收件人白名單，收件人名單由後端 Script Properties 控制。

## 正式 Apps Script 專案需要整合、重新部署

GitHub 原始碼檔案 `backend/overtime-accounting-email.gs` 已新增函式，但**加入 GitHub 不代表正式 Apps Script 已經更新**。請在原有受權限保護的 Apps Script 專案中更新同名函式，並將既有驗證的 **POST action router** 連結以下動作：

| 前端 action | 後端函式 | 說明 |
|---|---|---|
| `getOvertimeMailOptions` | `p79OvertimeMailOptions_(ss,data)` | 讀取月份、收件人及寄送稽核；新版回傳 `overtimeMailVersion:2` |
| `manageOvertimeMailRecipients` | `p79OvertimeMailManageRecipient_(ss,data)` | 管理員新增／移除受控收件信箱 |
| `sendOvertimeAccountingDayMail` | `p79OvertimeDayMailSend_(ss,data)` | 嚴格核對整個日期，**一封**郵件合併所有有效加班申報 |

原本的 `sendOvertimeAccountingMail`（逐人寄信）可保留作舊紀錄相容，但新版前端**不會呼叫**它。請勿將舊的逐人 action 改成在迴圈中寄多封信。

若尚未設定，在 Apps Script 的 **Project Settings → Script Properties** 中新增 `P79_OVERTIME_MAIL_RECIPIENTS_V1`，初始值可為 `[]`。完成最新版後端部署及 MailApp 授權後，具有 `workhours/manage` + `schedule/manage` 權限的管理員就能在網頁內按「＋ 新增 Mail」，不用再手動改 Script Properties。

後端仍必須保留原本的 session token、管理範圍檢查、MailApp 寄信權限、稽核表及正式 Google Apps Script Web App 部署版本。管理員新增 Mail 會寫入 `P79_OVERTIME_MAIL_RECIPIENT_AUDIT_V1`；寄送稽核使用 `P79_OVERTIME_MAIL_AUDIT_V1`。

## 核對規則與安全

1. 管理員按發送時，瀏覽器交出選定日期下**所有有效申報的完整版本**；後端重新從正式班表讀取這一天全體人員的申報，全部一致才准發送，避免新增或刪除後漏寄。
2. 後端拒絕非白名單收件人、未授權管理者、沒有申報的日期、被撤銷的申報，以及不同的完整版本。
3. 同日、同收件人、同一份申報版本只能成功寄出一次。不同版本另寄一封更新通知；寄送紀錄不得被覆寫。
4. Google MailApp 回應成功及雲端回條核實後，才標記已發送。這仍**不是已送達／已閱讀／已核准**的證據。
5. 除了寄信之外，不更新、不刪除原本任何加班／班表／考勤資料。
6. 用測試信箱、測試日期驗證後再正式開放。如果目前仍是 `overtimeMailVersion:1` 或出現「未知操作」，新版 UI 會阻止寄送，不假裝成功。

**目前只有 GitHub 端程式已更新；沒有直接登入或部署正式 Apps Script。尚未發送真實 Mail。**
