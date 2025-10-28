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

- **Enable Prompt API:**  
  `chrome://flags/#prompt-api-for-gemini-nano`  
  _Set to: Enabled_

- **Enable Summarizer API**  
  `chrome://flags/#summarization-api-for-gemini-nano`  
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

#### Click the wrench icon in the top right of the popup:
<img width="448" height="601" alt="image" src="https://github.com/user-attachments/assets/16978c75-51f2-4f38-83ba-0281e332bef2" />

#### Then click **Start Download** (This may take a while depending on your connection!)
<img width="454" height="600" alt="image" src="https://github.com/user-attachments/assets/3e95f59c-6532-4422-bd81-c9788bb150cd" />

---

## 📝 Usage

1. **Whitelist news domains** using the popup.
2. Navigate to a news article (not the homepage).
3. Click the 🧠 button to open the sidebar.
4. Explore emotion pulse, bias, analysis, quiz, and chat features.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
