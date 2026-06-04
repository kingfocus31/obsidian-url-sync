[简体中文](README.md) | [English](README_EN.md)

# Bilibili to Obsidian

Quickly sync Bilibili video lists to Obsidian notes.

[![GitHub release](https://img.shields.io/github/v/release/kingfocus31/obsidian-url-sync?style=flat-square)](https://github.com/kingfocus31/obsidian-url-sync/releases)
[![License](https://img.shields.io/github/license/kingfocus31/obsidian-url-sync?style=flat-square)](LICENSE)

> Quickly sync Bilibili video lists to Obsidian. Supports multiple link formats including user profiles, collections, and series. Automatic incremental updates with one-click resync from history.

If you encounter any issues, please create a [new issue](https://github.com/kingfocus31/obsidian-url-sync/issues) or join our Telegram group for help: https://t.me/obsidian_users

---

## ✨ Features

### 🚀 Simple Configuration
- Just paste a Bilibili link to sync - no complex setup required
- Configure sync root directory for automatic hierarchical folder structure

### 📗 Video List Sync
- Supports user profile and video page links
- Supports collection and series links
- Automatically fetches video titles, URLs, and publish dates
- Incremental sync - only adds new, no duplicates

### 🌲 Tree Directory Selector
- Visual directory selection for sync target
- Multi-level directory expand/collapse
- Exclude directories from display

### 📝 History
- View all sync history
- One-click resync with auto-filled URL and target directory
- Open synced notes directly

### 📑 Index Note
- Auto-generate index file summarizing all synced content
- Customizable index file name

### 🎨 UI Interaction
- Ribbon icon for quick access
- Left-click to open sync panel
- Right-click to access settings

---

## 🚀 Quick Start

### Step 1: Install Plugin

**From Community Plugins:**
Open Obsidian Settings > Community Plugins > Browse, search for "Bilibili to Obsidian" and install.

**Manual Install:**
Download the latest release from [GitHub Releases](https://github.com/kingfocus31/obsidian-url-sync/releases), and place `main.js`, `styles.css`, `manifest.json` into `.obsidian/plugins/obsidian-bilibili-sync` folder.

### Step 2: Configure Plugin

1. Open Obsidian Settings > Community Plugins
2. Enable "Bilibili to Obsidian"
3. Click the settings icon to configure (optional):
   - **Sync Root Directory**: Base path for saving video lists (e.g., `Bilibili`)
   - **Index Note**: Whether to generate an index file
   - **Exclude Directories**: Hide directories from the selector

### Step 3: Start Syncing

1. Click the Bilibili icon in the left sidebar to open the sync panel
2. Paste a Bilibili link (supported formats):
   - User profile: `https://space.bilibili.com/xxxxx`
   - Collection: `https://space.bilibili.com/xxxxx/lists/xxxxx`
   - Series: `https://space.bilibili.com/xxxxx/channel/seriesdetail?sid=xxxxx`
3. Select target directory
4. Click "Start Sync"

---

## 📋 Supported Link Formats

| Format | Example |
| --- | --- |
| User Profile | `https://space.bilibili.com/456751403` |
| User Videos | `https://space.bilibili.com/456751403/video` |
| Collection | `https://space.bilibili.com/456751403/lists/7978502` |
| Series | `https://space.bilibili.com/456751403/channel/seriesdetail?sid=xxxxx` |

---

## ⚙️ Configuration

| Option | Description | Default |
| --- | --- | --- |
| Sync Root Directory | Base path for saving video lists, leave empty for entire Vault | Empty |
| Enable Index Note | Generate index file summarizing all synced content | Enabled |
| Index Note Name | Name of the index file (without path) | B站UP主同步索引.md |
| Exclude Directories | List of directories to hide from selector | Empty |

---

## 📝 Generated Note Format

After syncing, a note with the following format is generated:

```markdown
# Bilibili Video List - [UP Name]

- UP: [UP Name]
- MID: [User ID]
- Source: [Bilibili URL]
- Videos: [Video Count]
- Synced: [Sync Time]

| # | Title | URL | Published |
| --: | --- | --- | --- |
| 1 | Video Title | https://bilibili.com/video/xxxxx | 2024-01-01 |
| 2 | ... | ... | ... |
```

---

## 🗺️ Roadmap

We're continuously improving the plugin. Here are our future plans:

- [ ] **Favorites Sync**: Sync user favorites
- [ ] **Watch Later**: Sync watch later list
- [ ] **Comments**: Fetch video comments
- [ ] **Subtitles**: Export video subtitles
- [ ] **Cover Download**: Auto-download video covers

If you have suggestions or new ideas, please share them by creating an [Issue](https://github.com/kingfocus31/obsidian-url-sync/issues) - we'll carefully evaluate and adopt suitable suggestions.

---

## 💖 Support

If you find this plugin useful and want it to continue development, please support us through:

| WeChat | 
| :---: |
| ![WeChat](screenshots/wechat.jpg) |

---

## 📄 License

[MIT License](LICENSE)
