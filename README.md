<div align="center">

# 📚 StudoCu Downloader

### 🚀 Download any document from StudoCu as PDF — for free!

<br/>

[![GitHub stars](https://img.shields.io/github/stars/ThanhNguyxn/studocu-dowloader?style=for-the-badge&logo=github&color=yellow)](https://github.com/ThanhNguyxn/studocu-dowloader/stargazers)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ThanhNguyxn)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/thanhnguyxn)

<br/>

<img src="https://img.shields.io/badge/Chrome-Supported-success?style=flat-square&logo=googlechrome&logoColor=white"/>
<img src="https://img.shields.io/badge/Edge-Supported-success?style=flat-square&logo=microsoftedge&logoColor=white"/>
<img src="https://img.shields.io/badge/Brave-Supported-success?style=flat-square&logo=brave&logoColor=white"/>
<img src="https://img.shields.io/badge/Opera-Supported-success?style=flat-square&logo=opera&logoColor=white"/>

---

**✨ Bypass blur & watermark • 📄 Export with selectable text • 🚀 One-click download**

</div>

<br/>

---

## ✨ Features

| Feature | Description |
|:--------|:------------|
| 🔓 **Bypass Blur** | Remove blur overlay and watermark instantly by clearing cookies |
| 📄 **PDF Export** | Export document with selectable text layer (copy/paste works!) |
| 🎨 **Clean Output** | No black lines, no artifacts, proper A4 formatting |
| ⚡ **One-Click** | Simple extension popup, no technical knowledge needed |
| 🌐 **Multi-Browser** | Works on Chrome, Edge, Brave, Opera, Cốc Cốc... |

---

<br/>

## 📥 Installation Guide

> **This is a Chrome Extension (also works on Edge, Brave, Opera, Cốc Cốc)**

### Step 1: Download the Extension

**Option A: Download ZIP (Recommended)**

[![Download ZIP](https://img.shields.io/badge/Download%20ZIP-4285F4?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ThanhNguyxn/studocu-dowloader/archive/refs/heads/main.zip)

**Option B: Clone with Git**
```bash
git clone https://github.com/ThanhNguyxn/studocu-dowloader.git
```

---

### Step 2: Extract the ZIP file

1. **Download** the ZIP file
2. **Right-click** → **Extract All** (or use WinRAR/7-Zip)
3. **Remember** the folder location (e.g., `C:\studocu-dowloader-main`)

---

### Step 3: Load Extension in Browser

#### 🔵 Google Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. **Enable** "Developer mode" (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the **extracted folder** (the one containing `manifest.json`)
5. ✅ Done! You'll see the extension icon in your toolbar

#### 🟢 Microsoft Edge

1. Open Edge and go to: `edge://extensions/`
2. **Enable** "Developer mode" (toggle in left sidebar)
3. Click **"Load unpacked"**
4. Select the **extracted folder**
5. ✅ Done!

#### 🟠 Brave Browser

1. Open Brave and go to: `brave://extensions/`
2. **Enable** "Developer mode"
3. Click **"Load unpacked"**
4. Select the **extracted folder**
5. ✅ Done!

#### 🔴 Opera / Opera GX

1. Open Opera and go to: `opera://extensions/`
2. **Enable** "Developer mode"
3. Click **"Load unpacked"**
4. Select the **extracted folder**
5. ✅ Done!

#### 🟢 Cốc Cốc

1. Open Cốc Cốc and go to: `coccoc://extensions/`
2. **Enable** "Developer mode"
3. Click **"Load unpacked"**
4. Select the **extracted folder**
5. ✅ Done!

---

<br/>

## 📖 How to Use

### Step 1: Go to StudoCu Document

Navigate to any document page on StudoCu:
- `https://www.studocu.com/document/...`
- `https://www.studocu.vn/document/...`

---

### Step 2: Click Extension Icon

Click the **StudoCu Downloader** icon in your browser toolbar (top-right corner).

---

### Step 3: Bypass Blur (if needed)

If the document content is **blurred or watermarked**:

1. Click **"🔓 Bypass Blur"**
2. Wait for the page to reload
3. The blur should be gone!

> 💡 **Tip:** If blur persists, try opening the document in **Incognito/Private mode** first.

---

### Step 4: Load All Pages

**IMPORTANT:** Before creating PDF, you must load all pages:

1. **Scroll down** slowly through the entire document
2. Wait for each page to fully load (images appear)
3. Scroll until you reach the **last page**

> ⚠️ If you skip this step, some pages will be missing from your PDF!

---

### Step 5: Create PDF

1. Click **"📄 Create PDF"**
2. Wait for processing (you'll see progress in the status bar)
3. **Print dialog** will open automatically

---

### Step 6: Save as PDF

In the print dialog:

| Setting | Value |
|:--------|:------|
| **Destination** | `Save as PDF` or `Microsoft Print to PDF` |
| **Margins** | `None` |
| **Background graphics** | `✅ Enabled` |

Click **"Save"** → Choose location → **Done!** 🎉

---

<br/>

## 🖨️ Recommended Print Settings

For best PDF quality, use these settings:

| Setting | Recommended Value |
|:--------|:------------------|
| **Destination** | `Save as PDF` |
| **Pages** | `All` |
| **Layout** | `Portrait` |
| **Margins** | `None` |
| **Scale** | `Default` or `100%` |
| **Background graphics** | `✅ Enabled` |

---

<br/>

## 📂 Project Structure

```
📦 studocu-dowloader/
 ┣ 📁 icons/           ← Extension icons
 ┃ ┣ icon16.png
 ┃ ┣ icon48.png
 ┃ ┗ icon128.png
 ┣ 📜 manifest.json    ← Extension configuration
 ┣ 📜 popup.html       ← Extension popup UI
 ┣ 📜 popup.css        ← Popup styles
 ┣ 📜 popup.js         ← Main logic
 ┣ 📜 content.css      ← Auto-injected styles
 ┣ 📜 print.css        ← Print-specific styles
 ┣ 📜 README.md        ← This file
 ┗ 📄 LICENSE          ← MIT License
```

---

<br/>

## ❓ Troubleshooting

### "No pages found" error
- **Solution:** Scroll through the entire document first to load all pages

### Blur not removed after bypass
- **Solution:** Try opening the document in **Incognito/Private mode**

### Some pages missing in PDF
- **Solution:** Scroll more slowly, wait for images to fully load

### Print dialog not opening
- **Solution:** Check if popup blocker is enabled, allow popups for StudoCu

### Extension not showing in toolbar
- **Solution:** Click the puzzle icon 🧩 → Pin "StudoCu Downloader"

---

<br/>

## ⚠️ Disclaimer

> [!CAUTION]
> **Legal Notice:** This tool is provided for **personal and educational purposes only**.

- 📚 **Educational Use:** Intended for students and researchers who need offline access to study materials
- ⚖️ **Copyright:** Please respect intellectual property rights and StudoCu's Terms of Service
- 🚫 **No Redistribution:** Do not redistribute downloaded content commercially or publicly
- 👤 **Your Responsibility:** You are solely responsible for how you use this tool

**By using this tool, you agree that:**
1. You will only download content you have legitimate access to
2. You will not use it to infringe on any copyrights
3. The authors are not liable for any misuse of this tool

---

<br/>

<div align="center">

### ⭐ Star this repo if it helped you!

<br/>

[![Made with ❤️](https://img.shields.io/badge/Made%20with-❤️-red?style=for-the-badge)](https://github.com/ThanhNguyxn)
[![GitHub](https://img.shields.io/badge/ThanhNguyxn-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ThanhNguyxn)
[![GitHub Sponsors](https://img.shields.io/badge/💖%20Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ThanhNguyxn)
[![Buy Me a Coffee](https://img.shields.io/badge/☕%20Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/thanhnguyxn)

</div>
