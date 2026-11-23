# 79號碼頭 Windows 正式發行者簽章與 SmartScreen

## 問題

從 GitHub 下載的 `Port79WindowsLite.exe` 若顯示「Windows 已保護您的電腦 / 未知的發行者」，表示 Windows 尚無法確認這份程式的可信發行者身分。程式安全檢查、SHA-256 或更換 ZIP 名稱**無法取代** Authenticode 簽章。簽章本身也**不能保證** SmartScreen 當下完全不顯示警告；微軟會依下載、檔案及發行者信譽判定。

請勿要求使用者停用 Defender/SmartScreen、修改系統政策、將全公司電腦一律設定允許未知程式，或用自簽憑證冒充公開信任的簽章。

## 發行準備

正式發行必須有經驗證的發行者，以及受 Windows 信任的 **程式碼簽章服務或憑證**。目前 CI 提供 Azure Artifact Signing 的自動化整合；申請資格取決於 Microsoft 支援的國家／地區與身分驗證。若公司不符合資格，應採用合格的公開信任 CA 與 HSM 簽章流程，**不可**把本流程直接改為自簽或移除驗證。請勿將私鑰、PFX 或登入密碼提交到 GitHub 程式庫。

符合資格、且 Azure Artifact Signing 身分、憑證設定檔已建立之後，設定 GitHub Repository Variables：

- `PORT79_SIGNING_PROVIDER=azure`
- `PORT79_REQUIRE_SIGNED_WINDOWS=true`
- `PORT79_ARTIFACT_SIGNING_ENDPOINT`：組織所屬地區 endpoint，例如 `https://eus.codesigning.azure.net/`
- `PORT79_ARTIFACT_SIGNING_ACCOUNT`：組織的簽署帳戶
- `PORT79_ARTIFACT_SIGNING_PROFILE`：受驗證的憑證設定檔

並將 OIDC federated credential 設定為**只信任此 repository 的 main 發行流程**，在 GitHub Actions Secrets 設定 `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`。Azure 身分須有對應設定檔的 **Artifact Signing Certificate Profile Signer** 權限。以上不應透過聊天提供任何私鑰或密碼。

CI 完成正常建置及 Windows 原生更新回歸驗證之後，在正式建置階段簽署：

1. `79號碼頭_Windows輕量版/Port79WindowsLite.exe`
2. `79號碼頭_Windows輕量版/app/Port79Updater.exe`

`repack-signed-release.ps1` 會驗證兩個 EXE 的 Authenticode 簽章、程式碼簽章 EKU 與相同發行者，**重新建立包含簽章檔案的完整 ZIP**，並從 ZIP 再解出 EXE 二次驗證。正式 release 的 SHA-256 仍由最後簽署版 ZIP 計算。保留 `local-data` 空白交付、不加入員工、考勤、排班或帳密資料。PR 測試不使用 Azure 簽署身分。

將 `PORT79_REQUIRE_SIGNED_WINDOWS=true` 設為強制模式時，若 `PORT79_SIGNING_PROVIDER` 未設定為已支援的受信任簽章方法，主線建置將失敗且不發布 Windows 完整版，以免誤認未簽章 ZIP 已符合全公司發行要求。

## 驗收與後續

- 在 GitHub Actions 的正式建置中確認 `PASS signed release`。
- 下載**新正式版 ZIP**，檢查其內主程式與原生更新器的 Windows「數位簽章」頁籤是否有預期公司名稱及有效簽章。
- 在至少兩台未曾使用過本系統的 Windows 10/11 裝置實測，並核對 SmartScreen 與公司端點管理政策。**簽章後初期仍可能出現警告**，因為 SmartScreen 信譽不是立即建立。
- 所有版本必須沿用穩定且驗證過的發行者簽章身分。
- 勿建議其他使用者按「仍要執行」作為正式部署解法；若公司受 WDAC/AppLocker 等政策控管，需由資訊管理員確認核准的簽章發行者及部署方式。

參考：
- https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- https://github.com/Azure/artifact-signing-action
