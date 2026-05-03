# 建良鵝肉 官方網站 部署指南

這個 `website/` 資料夾是一個 **完全獨立** 的靜態網站，所有資源（圖片、字型、商品資料）都在資料夾內，可直接部署到任何靜態主機。

最終目標：把這個網站部署到 `https://jianliang-goose.github.io/`（USER 根目錄）。

---

## 部署到 GitHub Pages USER 首頁

### 步驟 1️⃣ ： 在 GitHub 建一個新 repo

1. 登入 https://github.com/jianliang-goose
2. 點右上角 `+` → `New repository`
3. **Repository name 必須打：`jianliang-goose.github.io`**（一字不差，全部小寫）
4. Public（公開）
5. **不要** 勾選任何 README / .gitignore / license
6. 按 `Create repository`

### 步驟 2️⃣ ： 在你的電腦把網站推上去

打開終端機，cd 到一個你方便的工作資料夾，然後執行：

```bash
# 1. 把這個 repo clone 下來（如果還沒有）
git clone https://github.com/jianliang-goose/group_order.git
cd group_order

# 2. 切到本次的分支
git fetch origin
git checkout claude/build-official-website-9oIXF

# 3. 把 website/ 內容複製到一個全新的資料夾
cd ..
cp -r group_order/website jianliang-goose.github.io
cd jianliang-goose.github.io

# 4. 初始化 git 並推上去
git init
git branch -M main
git add .
git commit -m "Initial: 建良鵝肉 官方網站"
git remote add origin https://github.com/jianliang-goose/jianliang-goose.github.io.git
git push -u origin main
```

### 步驟 3️⃣ ： 啟用 GitHub Pages

1. 進到剛才建的 repo `jianliang-goose.github.io`
2. `Settings` → 左邊選單 `Pages`
3. 在 **Source** 下選 `Deploy from a branch`
4. **Branch**：`main`，folder：`/ (root)`
5. 按 `Save`

等大約 1～2 分鐘，網址 **https://jianliang-goose.github.io/** 就會生效。

---

## 之後要更新內容怎麼辦？

直接在 `jianliang-goose.github.io` 這個 repo 修改，push 後 GitHub Pages 會自動重新部署。

如果是改商品（如價格、名稱），請改 Google Sheet（與團購頁共用同一份），1～2 分鐘內官網會自動同步（CSV cache）。

---

## 自訂網域（選用）

之後想用例如 `www.jianliang-goose.com` 這類網域：

1. 買網域（推薦：Cloudflare、Gandi、PChome）
2. 在 `Settings` → `Pages` → `Custom domain` 填入網域
3. 在網域註冊商把 DNS CNAME 指向 `jianliang-goose.github.io`
4. 等 DNS 生效後，網站就會走自訂網址（GitHub 會自動配 HTTPS）

---

## 兩個網址的關係

| 網址 | 用途 | 來源 repo |
|---|---|---|
| https://jianliang-goose.github.io/ | 官方網站（多頁、購物車、結帳） | `jianliang-goose.github.io` |
| https://jianliang-goose.github.io/group_order/ | 限時團購頁（既有單頁） | `group_order` |

兩邊互相連結（官網 footer、首頁 banner、FAQ、最新消息都有引導連結）。
共用同一個 Google Apps Script 後端，訂單寫到同一個 Sheet。
