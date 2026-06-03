import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, Menu } from 'obsidian';
import { BilibiliClient, ImportTarget, Video, Collection } from './src/bilibili-client';
import { ObsidianWriter, SourceInfo } from './src/obsidian-writer';
import { StateStore } from './src/storage';
import { SyncPanel, VIEW_TYPE_BILIBILI_SYNC } from './src/sync-panel';

interface BilibiliSyncSettings {
  enableIndexNote: boolean;
  indexNoteName: string;
  syncRoot: string;
  excludedDirs: string[];
}

const DEFAULT_SETTINGS: BilibiliSyncSettings = {
  enableIndexNote: true,
  indexNoteName: 'B站UP主同步索引.md',
  syncRoot: '',
  excludedDirs: [],
};

export default class BilibiliSyncPlugin extends Plugin {
  settings: BilibiliSyncSettings = DEFAULT_SETTINGS;
  private client: BilibiliClient;
  store: StateStore;

  async onload() {
    await this.loadSettings();
    
    this.client = new BilibiliClient();
    this.store = new StateStore();
    
    // 注册视图
    this.registerView(
      VIEW_TYPE_BILIBILI_SYNC,
      (leaf) => new SyncPanel(leaf, this)
    );
    
    // 添加左侧边栏图标
    const ribbonIconEl = this.addRibbonIcon('video', 'B站同步', (evt: MouseEvent) => {
      // 左键点击打开同步面板
      this.activateView();
    });
    ribbonIconEl.setAttribute('aria-label', 'B站同步');
    
    // 右键菜单
    ribbonIconEl.addEventListener('contextmenu', (evt: MouseEvent) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle('打开同步面板').onClick(() => {
          this.activateView();
        });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle('插件设置').onClick(() => {
          this.openSettings();
        });
      });
      menu.showAtMouseEvent(evt);
    });
    
    // 添加命令
    this.addCommand({
      id: 'sync-bilibili-url',
      name: '同步B站链接',
      callback: () => this.openSyncModal(),
    });
    
    this.addCommand({
      id: 'view-sync-history',
      name: '查看同步历史',
      callback: () => this.openHistoryModal(),
    });
    
    this.addCommand({
      id: 'open-sync-panel',
      name: '打开同步面板',
      callback: () => this.activateView(),
    });
    
    // 添加设置标签页
    this.addSettingTab(new BilibiliSyncSettingTab(this.app, this));
    
    // 添加状态栏
    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('B站同步');
    statusBarItem.setAttribute('aria-label', '点击同步B站链接');
    statusBarItem.addEventListener('click', () => this.activateView());
    
    console.log('Bilibili to Obsidian plugin loaded');
  }

  onunload() {
    console.log('Bilibili to Obsidian plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async openSyncModal() {
    const modal = new BilibiliSyncModal(this.app, this);
    modal.open();
  }

  async openHistoryModal() {
    const modal = new HistoryModal(this.app, this);
    modal.open();
  }

  async activateView() {
    const { workspace } = this.app;
    
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_BILIBILI_SYNC);
    
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_BILIBILI_SYNC,
          active: true,
        });
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  openSettings() {
    // @ts-ignore
    this.app.setting.open();
    // @ts-ignore
    this.app.setting.openTabById(this.manifest.id);
  }

  async importUrl(url: string, categoryRel: string, progressCallback?: (message: string) => void): Promise<{
    mid: string;
    up_name: string;
    up_url: string;
    title: string;
    source_type: string;
    note_path: string;
    index_path: string;
    new_count: number;
    total_count: number;
    collections: Collection[];
  }> {
    const progress = progressCallback || (() => {});
    
    progress('解析链接...');
    const target = await this.client.resolveTarget(url);
    progress(`识别到目标：${target.title} [${target.source_type}]`);
    
    progress('抓取视频列表...');
    const { target: updatedTarget, videos, collections } = await this.client.fetchTargetVideos(target);
    progress(`抓取完成：共识别 ${videos.length} 个视频。`);
    
    const existingMap = this.store.loadVideoMap(updatedTarget.source_key);
    const newVideos = videos.filter((video: Video) => !existingMap[video.bvid]);
    progress(`增量对比完成：新增 ${newVideos.length} 个，已存在 ${Object.keys(existingMap).length} 个。`);
    this.store.upsertVideos(updatedTarget.source_key, videos);
    
    const allVideos = this.store.listVideos(updatedTarget.source_key);
    const writer = new ObsidianWriter(this.app.vault, this.getIndexNotePath());
    const notePath = writer.notePathFor(
      updatedTarget.source_type,
      updatedTarget.title,
      updatedTarget.source_id,
      categoryRel
    );
    
    progress('写入 Obsidian 笔记...');
    await writer.writeChannelNote(
      notePath,
      updatedTarget.title,
      updatedTarget.up_name,
      updatedTarget.mid,
      updatedTarget.source_url,
      allVideos,
      collections,
      categoryRel,
      updatedTarget.source_type
    );
    
    const syncedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    this.store.upsertSource({
      source_key: updatedTarget.source_key,
      source_type: updatedTarget.source_type,
      source_id: updatedTarget.source_id,
      mid: updatedTarget.mid,
      title: updatedTarget.title,
      up_name: updatedTarget.up_name,
      source_url: updatedTarget.source_url,
      target_dir: categoryRel,
      note_path: notePath,
      collections_json: JSON.stringify(collections),
      last_synced_at: syncedAt,
      total_video_count: allVideos.length,
    });
    
    let index_path = '';
    if (this.settings.enableIndexNote) {
      index_path = await writer.updateIndexNote(this.store.listSources());
      progress('同步索引完成。');
    } else {
      progress('跳过索引文件（已禁用）。');
    }
    
    return {
      mid: updatedTarget.mid,
      up_name: updatedTarget.up_name,
      up_url: updatedTarget.source_url,
      title: updatedTarget.title,
      source_type: updatedTarget.source_type,
      note_path: notePath,
      index_path,
      new_count: newVideos.length,
      total_count: allVideos.length,
      collections,
    };
  }

  private getIndexNotePath(): string {
    if (!this.settings.enableIndexNote) {
      return '';
    }
    const syncRoot = this.settings.syncRoot;
    if (syncRoot) {
      return `${syncRoot}/${this.settings.indexNoteName}`;
    }
    return this.settings.indexNoteName;
  }
}

class BilibiliSyncModal extends Modal {
  private plugin: BilibiliSyncPlugin;
  urlInput: HTMLInputElement;
  private categorySelect: HTMLSelectElement;
  private statusDiv: HTMLDivElement;
  private logDiv: HTMLDivElement;

  constructor(app: App, plugin: BilibiliSyncPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('bilibili-sync-modal');
    
    contentEl.createEl('h2', { text: 'B站视频同步到Obsidian' });
    
    // URL输入
    contentEl.createEl('label', { text: 'B站链接' });
    this.urlInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: '输入UP主主页、投稿页或视频链接',
    });
    
    // 分类选择
    contentEl.createEl('label', { text: '目标分类目录' });
    this.categorySelect = contentEl.createEl('select');
    
    // 添加现有目录
    this.addExistingDirectories();
    
    // 状态显示
    this.statusDiv = contentEl.createEl('div', { text: '准备就绪' });
    this.statusDiv.addClass('bilibili-sync-status');
    
    // 日志显示
    this.logDiv = contentEl.createEl('div');
    this.logDiv.addClass('bilibili-sync-log');
    
    // 按钮
    const buttonDiv = contentEl.createEl('div');
    
    buttonDiv.createEl('button', { text: '开始同步' }).addEventListener('click', () => this.startSync());
    
    buttonDiv.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
  }

  private async addExistingDirectories() {
    const vault = this.app.vault;
    const syncRoot = this.plugin.settings.syncRoot;
    let root: TFolder;
    
    if (syncRoot) {
      const baseFile = vault.getAbstractFileByPath(syncRoot);
      if (baseFile instanceof TFolder) {
        root = baseFile;
      } else {
        root = vault.getRoot();
      }
    } else {
      root = vault.getRoot();
    }
    
    const addFolders = (folder: TFolder, prefix = '') => {
      for (const child of folder.children) {
        if (child instanceof TFolder && !child.name.startsWith('.')) {
          const path = prefix ? `${prefix}/${child.name}` : child.name;
          this.categorySelect.createEl('option', {
            text: path,
            value: path,
          });
          addFolders(child, path);
        }
      }
    };
    
    addFolders(root);
  }

  private appendLog(message: string) {
    const timestamp = new Date().toTimeString().split(' ')[0];
    this.logDiv.createEl('div', { text: `[${timestamp}] ${message}` });
    this.logDiv.scrollTop = this.logDiv.scrollHeight;
  }

  private async startSync() {
    const url = this.urlInput.value.trim();
    if (!url) {
      new Notice('请输入B站链接');
      return;
    }
    
    const categoryPath = this.categorySelect.value;
    if (!categoryPath) {
      new Notice('请选择目标分类目录');
      return;
    }
    
    this.statusDiv.setText('执行中...');
    this.urlInput.disabled = true;
    this.categorySelect.disabled = true;
    
    try {
      this.appendLog(`开始处理：${url}`);
      
      const result = await this.plugin.importUrl(url, categoryPath, (message) => {
        this.appendLog(message);
      });
      
      this.statusDiv.setText('完成');
      this.appendLog(`完成：${result.up_name}，新增 ${result.new_count} 个，累计 ${result.total_count} 个。`);
      this.appendLog(`笔记：${result.note_path}`);
      if (this.plugin.settings.enableIndexNote) {
        this.appendLog(`索引：${result.index_path}`);
      }
      
      new Notice(`同步完成：${result.up_name}\n新增 ${result.new_count} 个视频`);
      
      // 打开生成的笔记
      const noteFile = this.app.vault.getAbstractFileByPath(result.note_path);
      if (noteFile instanceof TFile) {
        await this.app.workspace.openLinkText(result.note_path, '', true);
      }
      
    } catch (error) {
      this.statusDiv.setText('失败');
      this.appendLog(`失败：${error.message}`);
      new Notice(`同步失败：${error.message}`);
    } finally {
      this.urlInput.disabled = false;
      this.categorySelect.disabled = false;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class HistoryModal extends Modal {
  private plugin: BilibiliSyncPlugin;
  private historyList: HTMLDivElement;

  constructor(app: App, plugin: BilibiliSyncPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('bilibili-sync-modal');
    
    contentEl.createEl('h2', { text: '同步历史' });
    
    this.historyList = contentEl.createEl('div');
    
    const sources = this.plugin.store.listSources();
    
    if (sources.length === 0) {
      this.historyList.createEl('div', { text: '暂无同步记录' });
      return;
    }
    
    for (const source of sources) {
      const item = this.historyList.createEl('div');
      item.createEl('div', { text: source.title }).addClass('bilibili-sync-history-title');
      item.createEl('div', { text: `类型：${source.source_type}` });
      item.createEl('div', { text: `最近同步：${source.last_synced_at}` });
      item.createEl('div', { text: `视频数：${source.total_video_count}` });
      
      const buttonDiv = item.createEl('div');
      
      buttonDiv.createEl('button', { text: '重新同步' }).addEventListener('click', async () => {
        const modal = new BilibiliSyncModal(this.app, this.plugin);
        modal.urlInput.value = source.source_url;
        modal.open();
        this.close();
      });
      
      buttonDiv.createEl('button', { text: '打开笔记' }).addEventListener('click', async () => {
        const noteFile = this.app.vault.getAbstractFileByPath(source.note_path);
        if (noteFile instanceof TFile) {
          await this.app.workspace.openLinkText(source.note_path, '', true);
          this.close();
        }
      });
      
      buttonDiv.createEl('button', { text: '删除记录' }).addEventListener('click', () => {
        if (confirm(`确定要删除 ${source.title} 的同步记录吗？`)) {
          this.plugin.store.deleteSource(source.source_key);
          item.remove();
          new Notice(`已删除 ${source.title} 的同步记录`);
        }
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class BilibiliSyncSettingTab extends PluginSettingTab {
  plugin: BilibiliSyncPlugin;

  constructor(app: App, plugin: BilibiliSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h2', { text: 'B站同步设置' });
    
    // 索引文件开关
    new Setting(containerEl)
      .setName('启用索引文件')
      .setDesc('是否生成索引文件记录所有同步的UP主')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableIndexNote)
        .onChange(async (value) => {
          this.plugin.settings.enableIndexNote = value;
          await this.plugin.saveSettings();
          this.display(); // 刷新设置页面
        }));
    
    // 索引文件名称（仅在启用时显示）
    if (this.plugin.settings.enableIndexNote) {
      new Setting(containerEl)
        .setName('索引文件名称')
        .setDesc('索引文件的名称（不含路径）')
        .addText(text => text
          .setPlaceholder('B站UP主同步索引.md')
          .setValue(this.plugin.settings.indexNoteName)
          .onChange(async (value) => {
            this.plugin.settings.indexNoteName = value;
            await this.plugin.saveSettings();
          }));
    }
    
    // 同步根目录
    const syncRootSetting = new Setting(containerEl)
      .setName('同步根目录')
      .setDesc('目录选择器的根路径，留空表示整个保险库');
    
    const syncRootSelect = syncRootSetting.controlEl.createEl('select');
    syncRootSelect.createEl('option', { text: '整个保险库（根目录）', value: '' });
    this.addFolderOptions(syncRootSelect, '');
    syncRootSelect.value = this.plugin.settings.syncRoot;
    syncRootSelect.addEventListener('change', async () => {
      this.plugin.settings.syncRoot = syncRootSelect.value;
      await this.plugin.saveSettings();
      this.refreshSyncPanel();
    });
    
    // 排除目录（根据同步根目录过滤）
    containerEl.createEl('h3', { text: '排除目录' });
    containerEl.createEl('p', { 
      text: '以下目录将不会在目标目录选择器中显示（基于同步根目录）。',
      cls: 'setting-item-description'
    });
    
    const excludedDiv = containerEl.createEl('div');
    
    this.plugin.settings.excludedDirs.forEach((dir, index) => {
      const dirDiv = excludedDiv.createEl('div');
      dirDiv.addClass('bilibili-sync-excluded-item');
      
      const dirSetting = new Setting(dirDiv)
        .setName(`目录 ${index + 1}`);
      
      // 创建多级联动选择器
      const cascader = dirSetting.controlEl.createEl('div', { cls: 'cascader-select' });
      this.createCascadingSelect(cascader, dir, async (newPath: string) => {
        this.plugin.settings.excludedDirs[index] = newPath;
        await this.plugin.saveSettings();
      }, this.plugin.settings.syncRoot);
      
      dirSetting.addButton(button => button
        .setButtonText('删除')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.excludedDirs.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
    });
    
    new Setting(containerEl)
      .setName('添加排除目录')
      .setDesc('添加要排除的目录路径')
      .addButton(button => button
        .setButtonText('添加')
        .onClick(async () => {
          this.plugin.settings.excludedDirs.push('');
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  private addFolderOptions(select: HTMLSelectElement, basePath: string): void {
    const vault = this.app.vault;
    const root = basePath ? vault.getAbstractFileByPath(basePath) : vault.getRoot();
    
    if (root instanceof TFolder) {
      const addFolders = (folder: TFolder, prefix: string) => {
        for (const child of folder.children) {
          if (child instanceof TFolder && !child.name.startsWith('.')) {
            const path = prefix ? `${prefix}/${child.name}` : child.name;
            select.createEl('option', { text: path, value: path });
            addFolders(child, path);
          }
        }
      };
      addFolders(root, basePath);
    }
  }

  private createCascadingSelect(
    container: HTMLElement, 
    initialPath: string, 
    onChange: (path: string) => void,
    basePath: string = ''
  ): void {
    container.empty();
    container.addClass('cascader-container');
    
    const vault = this.app.vault;
    const root = basePath ? vault.getAbstractFileByPath(basePath) : vault.getRoot();
    
    if (!(root instanceof TFolder)) return;
    
    // 解析初始路径
    const pathParts = initialPath ? initialPath.split('/') : [];
    
    // 创建第一级选择器
    const selects: HTMLSelectElement[] = [];
    const selectElements: HTMLElement[] = [];
    
    const createLevel = (parentPath: string, level: number, selectedPart: string = '') => {
      const selectWrapper = container.createEl('div', { cls: 'cascader-level' });
      const select = selectWrapper.createEl('select', { cls: 'cascader-select-item' });
      select.createEl('option', { text: '请选择...', value: '' });
      
      // 获取父文件夹
      let parentFolder: TFolder | null = null;
      if (parentPath) {
        const file = vault.getAbstractFileByPath(parentPath);
        if (file instanceof TFolder) {
          parentFolder = file;
        }
      } else {
        parentFolder = root;
      }
      
      if (parentFolder) {
        for (const child of parentFolder.children) {
          if (child instanceof TFolder && !child.name.startsWith('.')) {
            select.createEl('option', { text: child.name, value: child.name });
          }
        }
      }
      
      if (selectedPart) {
        select.value = selectedPart;
      }
      
      selects.push(select);
      selectElements.push(selectWrapper);
      
      select.addEventListener('change', () => {
        // 清除后续选择器
        while (selects.length > level + 1) {
          selects.pop();
          selectElements.pop()?.remove();
        }
        
        // 构建当前路径
        const currentPath = this.buildPath(selects);
        
        // 如果有选择，创建下一级
        if (select.value) {
          const nextPath = currentPath;
          createLevel(nextPath, level + 1);
        }
        
        // 触发回调
        onChange(currentPath);
      });
      
      return select;
    };
    
    // 初始化选择器
    createLevel(basePath, 0, pathParts[0] || '');
    
    // 如果有初始路径，创建后续选择器
    if (pathParts.length > 1) {
      let currentPath = pathParts[0] || '';
      for (let i = 1; i < pathParts.length; i++) {
        const level = i;
        createLevel(currentPath, level, pathParts[i] || '');
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
      }
    }
  }

  private buildPath(selects: HTMLSelectElement[]): string {
    const parts: string[] = [];
    for (const select of selects) {
      if (select.value) {
        parts.push(select.value);
      } else {
        break;
      }
    }
    return parts.join('/');
  }

  private refreshSyncPanel(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BILIBILI_SYNC);
    for (const leaf of leaves) {
      const view = leaf.view as any;
      if (view && view.onOpen) {
        view.onOpen();
      }
    }
  }
}
