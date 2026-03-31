# Photoshop Case Batch Generator

A production-grade Photoshop extension built with **Bolt CEP** and **React 19** for high-volume automated batch generation of personalized phone cases. This tool streamlines the process of importing CSV/Excel order data, intelligently matching design assets, and generating ready-to-print canvas sheets.

## 🚀 Key Features

-   **Intelligent Asset Routing**: Automatic folder routing based on `Brand` mappings (e.g., `MT`, `LT`, `Casimoda`).
-   **Smart Fill & Crop**: 
    -   **Proportional Scaling**: Designs fill the target area without stretching.
    -   **Logo Protection**: Anchors to the left (normal cases) or right (mirrored glass cases) to preserve specific design elements.
    -   **Centered Vertical Crop**: Automatically centers the design vertically within its frame.
-   **Advanced Matching Logic**: 
    -   **Fuzzy Search**: Normalizes titles to match files by ignoring non-alphanumeric characters.
    -   **Clean Words**: Configurable exclusion list (e.g., `hoesje`, `hybride`) for improved accuracy.
    -   **Safest Match**: Longest-match-first algorithm to correctly distinguish `iPhone 15 Pro` from `iPhone 15`.
-   **Dynamic Typography & Borders**:
    -   **Multi-Line Labels**: Automatically splits long model names into two lines for perfect legibility.
    -   **Responsive Borders**: Left border dynamically expands from **10mm to 20mm** to accommodate longer labels.
-   **Native Experience**: Fully dockable, resizable, and themed-matched Photoshop panel.
-   **Modern Settings UI**: Card-based mapping management with high-contrast Hex-code color picking.

## 🛠️ Tech Stack

-   **Frontend**: React 19, SCSS, Vite
-   **Host**: Photoshop ExtendScript (TypeScript)
-   **Framework**: Bolt CEP (Modern CEP development framework)
-   **Build System**: Vite + TypeScript

## 📋 Prerequisites

-   **Adobe Photoshop** (CC 2022 or higher recommended)
-   **Node.js** (v18+)
-   **PlayerDebugMode Enabled**:
    ```bash
    defaults write com.adobe.CSXS.11 PlayerDebugMode 1
    # Repeat for versions 12, 13 (depending on your Photoshop version)
    ```

## 📦 Installation

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Casimoda/Photoshop_Phone_Cases.git
    cd Photoshop_Phone_Cases
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Start Dev Server**:
    ```bash
    npm run dev
    ```
4.  **Build for Production**:
    ```bash
    npm run build
    ```

## ⚙️ Configuration

The extension stores its configuration locally in Photoshop's settings, but defaults can be managed in `src/js/main/main.tsx`:

### **Shop Mappings**
Define how CSV `Brand` values correlate to local filesystem folders and border colors.
-   **Prefix**: Falls back to this if `Brand` column is missing.
-   **Shop**: The name in the CSV `Brand` column.
-   **Folder**: The actual subfolder inside your Designs directory.
-   **Color**: The hex code for the external crop border.

### **Clean Words**
A list of words to be ignored during the matching process to ensure CSV titles correctly match image filenames.

## 📄 License

Internal tool for Casimoda. All rights reserved.
