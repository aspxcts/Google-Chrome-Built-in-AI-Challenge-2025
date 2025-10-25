# SmartSight News Analyzer

![SmartSight Logo](SmartSightEXT/icons/icon128.png)

A modern Chrome Extension for hackathons that analyzes news articles using on-device AI (Gemini Nano). Features emotion pulse, bias detection, deep analysis, quizzes, and chat—all powered by Chrome's built-in AI.

---

## 🚀 Features

- **Emotion Pulse:** Visualizes emotional intensity across article paragraphs.
- **Bias Detection:** AI-powered political bias analysis.
- **Deep Analysis:** Key insights with paragraph references.
- **Comprehension Quiz:** Auto-generated multiple choice questions.
- **Chat:** Ask questions about the article, get instant AI answers.
- **Advanced Analysis:** Topic breakdown and source trust widget.

---

## 🏆 Hackathon Guidelines

- **Open Source:** [GitHub Repository](https://github.com/yourusername/smartsight-news-analyzer)  
  _Open source under the MIT license._
- **APIs Used:**
  - Chrome Prompt API 
  - Chrome Summarizer API
---

## ⚡ Setup Instructions

### 1. Enable Required Chrome Flags

Open Chrome and enter each URL below in the address bar. Set the flag as described.

- **Enable Gemini Nano:**  
  `chrome://flags/#prompt-api-for-gemini-nano`  
  _Set to: Enabled_

- **Enable Multimodal Input:**  
  `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`  
  _Set to: Enabled_

- **Enable On-Device Model:**  
  `chrome://flags/#optimization-guide-on-device-model`  
  _Set to: Enabled BypassPerfRequirement_

**After enabling these flags, restart Chrome.**

---

### 2. Download and Install the Extension

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/smartsight-news-analyzer.git
   ```
2. **Open Chrome Extensions:**  
   Go to `chrome://extensions/`
3. **Enable Developer Mode** (top right).
4. **Click "Load unpacked"** and select the project folder.

---

### 3. Download Gemini Nano Model

Chrome will automatically download the Gemini Nano model after enabling the flags and using the extension.  
If prompted, allow Chrome to complete the download.

---

## 📝 Usage

1. **Whitelist news domains** using the popup.
2. Navigate to a news article (not the homepage).
3. Click the 🧠 button to open the sidebar.
4. Explore emotion pulse, bias, analysis, quiz, and chat features.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🌐 Repository

[https://github.com/yourusername/smartsight-news-analyzer](https://github.com/yourusername/smartsight-news-analyzer)

---

## 🙌 Credits

Built for the Chrome AI Hackathon.
