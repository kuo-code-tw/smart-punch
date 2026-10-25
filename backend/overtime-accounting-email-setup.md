# 加班 Email 給會計 — Apps Script 正式啟用說明

2026-10-25，安全設計 / 尚待正式部署

## 前端已有的功能
- 「每日加班人員統計」新增「✉ 寄送會計 Email」按鈕。從管理員核准名單選會計，逐筆確認寄送。
- 寄送成功要有 MailApp 回應與雲端稽核紀錄讀回，不能按下按鈕就直接變色。
- 考勤日期：綠＝已申報未確認郵寄；藍＝目前申報版本已寄會計；黃＝有修改；橘＝之前版本已寄但目前內容不同、需要重寄；紅＝取消（優先於其他狀態）。
- 滑鼠移入日期可見姓名、時段、收件人、寄送時間等資訊。
- **現在尚未寄出任何真實 Email**。只有前端與後端整合範例進入公開程式庫，正式 Google Apps Script 尚未部署、未設定收件人。

## 正式 Google Apps Script 專案需要做的事
1. 將 backend/overtime-accounting-email.gs 複製進既有非公開 Apps Script 專案。必須保留原本登入驗證、權限、員工範圍與主試算表，不要建立未經認證的公開 URL。
2. 在既有的 POST action router 補上：
   getOvertimeMailOptions 交給 p79OvertimeMailOptions_(ss,data)
   sendOvertimeAccountingMail 交給 p79OvertimeMailSend_(ss,data)
   ss = 既有試算表實例；data = 解析過的 POST JSON。路由必須回傳完整 JSON 與錯誤訊息。
3. 在 Apps Script 的 Script Properties（不要放在前端、GitHub、LocalStorage）建立 P79_OVERTIME_MAIL_RECIPIENTS_V1，值為 JSON 陣列：
   [{"id":"accounting","name":"會計窗口","email":"accounting@example.invalid"}]
   必須由管理員改成經核准的真實公司收件地址。最多20筆；id 僅英數及底線、連字號，唯一且不可空白。無須儲存 Gmail 密碼或 API 密鑰。
4. 授權原有 Apps Script 專案使用 MailApp 寄信。如手動指定 OAuth scopes，包含 https://www.googleapis.com/auth/script.send_mail 及既有試算表 scopes。寄件人、配額取決於 Apps Script 的執行帳號，須符合公司資安政策。
5. 用測試帳號先驗證：缺權限不得看到收件名單、不可寄送白名單外信箱、已撤銷或更動版本的舊申報不得寄送。同筆／同版本／同收件人再按一次不能重複寄信。確認雲端建立 P79_OVERTIME_MAIL_AUDIT_V1 稽核紀錄，才可看到藍色。
6. 正式重新部署原本的 Apps Script Web App，勿公開原始收件人名單或放行未授權呼叫。前端若未收到 overtimeMailVersion:1，就維持禁用且不會宣稱寄出。

## 安全規範
- 後端每次寄出前重新從正式雲端讀取目前有效申報，嚴格比對申報 ID、日期、員工與整份版本內容，再檢查管理權限和收件人白名單。
- 同時需要 workhours/manage 和 schedule/manage 並通過可管理員工範圍核對。
- 稽核紀錄在送信前先寫 sending，MailApp 成功後改 sent。若已送出卻沒能確認稽核寫入，就停在待查狀態，由管理員手動查核而不是盲目重送。
- 不主動寄給不在白名單的人，不將整月考勤名冊當附件。僅寄送單筆申報摘要（姓名／工號／日期／時段／時數／申報編號）。
- MailApp 回報成功代表郵件服務接受寄信，不代表對方收件、已開信或會計已核准。
- 申報後又修改，原寄送版本保留，考勤日期改橘色提示重寄；取消優先顯示紅色，原信件不能當作有效付款依據。
- 實際寄信流程與會計確認／核准流程不同。如需收件確認，應另外設計會計確認狀態；不能以寄送成功替代。
