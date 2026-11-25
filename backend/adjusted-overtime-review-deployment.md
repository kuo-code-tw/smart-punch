# 調班後原預排轉正式申報：部署契約

本次變更只適用原本已存在、未審核的延時加班預排。正式出勤、最新正常班、原報單 ID、資料版本與權限仍須核對。實際加班在原核准請假班段內且不與其他已確認代班重疊者，保留代班關聯及正確加班歸屬日。實際時段不屬原代班時，同日且原日期一致的預排可經操作人員確認，沿用原報單 ID 改為本人加班，保留原代班來源稽核；不變更請假／代班安排。跨日歸屬變更仍需個別核對。不修改既有正式核准申報，不新增補卡或新的加班紀錄。

## GAS 正式部署（獨立於 GitHub Pages）
下載目前正式 GAS 完整 Code.gs，先保存備份，在專案根目錄執行：

```
node scripts/apply-gas-adjusted-overtime-review.cjs LIVE_Code.gs PATCHED_Code.gs
node tests/overtime-adjusted-shift-review.cjs
```

補丁採精確且唯一的來源錨點；任何一處不一致即中止，不得強行覆寫較新的 GAS。比對正式 GAS 的其他函式、同步資料欄位保留規則及新增稽核欄位後，使用既有 Web App 部署的新版本更新原部署。不得只開啟能力旗標。確認 `getOvertimeReportContext` 回傳 `capabilities.adjustedOvertimeReviewV1=true`，以隔離測試資料驗證正式儲存讀回保留 `adjustedCoverReview` 或 `adjustedIndependentFrom`，原報單 ID、班別、日期與原代班稽核不變。正式部署前保留現有版本，不應對真實員工試寫。

網頁與 Windows 使用同一前端；在後端能力未確認前，前端不會自動改為本人加班。本次 GitHub 上傳不等於 GAS 已發布，必須另行部署與實際讀回。
