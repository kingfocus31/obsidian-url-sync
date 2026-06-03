import { ItemView, WorkspaceLeaf, App, TFile, TFolder, Notice } from 'obsidian';
import { TreeSelectComponent } from './components/tree-select';
import { SourceInfo } from './obsidian-writer';

export const VIEW_TYPE_BILIBILI_SYNC = 'bilibili-sync-view';

export class SyncPanel extends ItemView {
  private plugin: any;
  private currentTab: 'sync' | 'history' = 'sync';
  private treeSelect: TreeSelectComponent | null = null;
  private urlInput: HTMLInputElement | null = null;
  private selectedPath: string = '';
  private statusDiv: HTMLDivElement | null = null;
  private logDiv: HTMLDivElement | null = null;
  private pendingUrl: string = '';
  private pendingDir: string = '';

  constructor(leaf: WorkspaceLeaf, plugin: any) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_BILIBILI_SYNC;
  }

  getDisplayText(): string {
    return 'B站同步';
  }

  getIcon(): string {
    return 'video';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('bilibili-sync-panel');

    // 标题
    container.createEl('h2', { text: 'B站视频同步到Obsidian' });

    // 页签切换
    const tabHeader = container.createEl('div', { cls: 'tab-header' });
    
    const syncTabBtn = tabHeader.createEl('button', {
      text: '同步',
      cls: `tab-button ${this.currentTab === 'sync' ? 'active' : ''}`,
    });
    syncTabBtn.addEventListener('click', () => this.switchTab('sync'));

    const historyTabBtn = tabHeader.createEl('button', {
      text: '历史',
      cls: `tab-button ${this.currentTab === 'history' ? 'active' : ''}`,
    });
    historyTabBtn.addEventListener('click', () => this.switchTab('history'));

    // 内容区域
    const contentContainer = container.createEl('div', { cls: 'tab-content' });

    if (this.currentTab === 'sync') {
      this.renderSyncTab(contentContainer);
    } else {
      this.renderHistoryTab(contentContainer);
    }
  }

  private switchTab(tab: 'sync' | 'history'): void {
    this.currentTab = tab;
    this.onOpen();
    
    // 如果有待回显的数据，在渲染后设置
    if (tab === 'sync' && (this.pendingUrl || this.pendingDir)) {
      setTimeout(() => {
        if (this.pendingUrl && this.urlInput) {
          this.urlInput.value = this.pendingUrl;
        }
        if (this.pendingDir && this.treeSelect) {
          this.selectedPath = this.pendingDir;
          this.treeSelect.setSelectedPath(this.pendingDir);
        }
        // 清空待回显数据
        this.pendingUrl = '';
        this.pendingDir = '';
      }, 100);
    }
  }

  private renderSyncTab(container: HTMLElement): void {
    // URL输入区域
    const urlSection = container.createEl('div', { cls: 'form-section' });
    urlSection.createEl('label', { text: 'B站链接', cls: 'form-label' });
    this.urlInput = urlSection.createEl('input', {
      type: 'text',
      placeholder: '输入UP主主页、投稿页或视频链接',
      cls: 'form-input',
    });

    // 目录选择器区域（树形结构）
    const dirSection = container.createEl('div', { cls: 'form-section' });
    dirSection.createEl('label', { text: '目标分类目录', cls: 'form-label' });
    
    // 展开/折叠按钮
    const buttonGroup = dirSection.createEl('div', { cls: 'tree-button-group' });
    buttonGroup.createEl('button', { text: '全部展开' }).addEventListener('click', () => {
      if (this.treeSelect) {
        this.treeSelect.expandAll();
      }
    });
    buttonGroup.createEl('button', { text: '全部折叠' }).addEventListener('click', () => {
      if (this.treeSelect) {
        this.treeSelect.collapseAll();
      }
    });

    // 树形选择器容器
    const treeContainer = dirSection.createEl('div', { cls: 'tree-select-wrapper' });
    
    // 获取同步目录作为基础路径
    const basePath = this.plugin.settings.syncRoot || '';
    
    this.treeSelect = new TreeSelectComponent(
      treeContainer,
      this.app.vault,
      this.plugin.settings.excludedDirs,
      basePath,
      (path) => {
        this.selectedPath = path;
      }
    );

    // 状态显示
    this.statusDiv = container.createEl('div', { text: '准备就绪' });
    this.statusDiv.addClass('bilibili-sync-status');

    // 日志显示
    this.logDiv = container.createEl('div');
    this.logDiv.addClass('bilibili-sync-log');

    // 按钮
    const buttonDiv = container.createEl('div', { cls: 'sync-button-group' });
    
    buttonDiv.createEl('button', { text: '开始同步', cls: 'mod-cta' }).addEventListener('click', () => this.startSync());
    
    buttonDiv.createEl('button', { text: '清空日志' }).addEventListener('click', () => {
      if (this.logDiv) {
        this.logDiv.empty();
      }
    });
  }

  private appendLog(message: string): void {
    if (!this.logDiv) return;
    
    const timestamp = new Date().toTimeString().split(' ')[0];
    this.logDiv.createEl('div', { text: `[${timestamp}] ${message}` });
    this.logDiv.scrollTop = this.logDiv.scrollHeight;
  }

  private renderHistoryTab(container: HTMLElement): void {
    const sources = this.plugin.store.listSources();
    
    if (sources.length === 0) {
      container.createEl('div', { text: '暂无同步记录', cls: 'history-empty' });
      return;
    }

    const historyList = container.createEl('div', { cls: 'history-list' });

    for (const source of sources) {
      this.renderHistoryItem(historyList, source);
    }
  }

  private renderHistoryItem(container: HTMLElement, source: SourceInfo): void {
    const item = container.createEl('div', { cls: 'history-item' });

    // 头部（简洁信息）
    const header = item.createEl('div', { cls: 'history-item-header' });
    
    // 类型标签
    const typeLabel = source.source_type === 'up' ? 'UP主' : 
                     source.source_type === 'season' ? '合集' : '系列';
    header.createEl('span', { 
      text: typeLabel, 
      cls: `history-item-type type-${source.source_type}` 
    });
    
    // 名称
    header.createEl('span', { 
      text: source.title, 
      cls: 'history-item-title' 
    });

    // 展开/折叠图标
    const expandIcon = header.createEl('span', { 
      text: '▶', 
      cls: 'history-item-expand-icon' 
    });

    // 详细信息（默认隐藏）
    const details = item.createEl('div', { cls: 'history-item-details hidden' });

    // URL
    details.createEl('div', { 
      text: `URL: ${source.source_url}`, 
      cls: 'history-item-url' 
    });

    // 同步时间
    details.createEl('div', { 
      text: `最近同步: ${source.last_synced_at}`, 
      cls: 'history-item-time' 
    });

    // 视频数
    details.createEl('div', { 
      text: `视频数: ${source.total_video_count}`, 
      cls: 'history-item-count' 
    });

    // 操作按钮
    const buttonDiv = details.createEl('div', { cls: 'history-item-buttons' });
    
    buttonDiv.createEl('button', { text: '增量同步' }).addEventListener('click', async () => {
      // 设置待回显的数据
      this.pendingUrl = source.source_url;
      this.pendingDir = source.target_dir;
      this.switchTab('sync');
    });
    
    buttonDiv.createEl('button', { text: '打开笔记' }).addEventListener('click', async () => {
      const noteFile = this.app.vault.getAbstractFileByPath(source.note_path);
      if (noteFile instanceof TFile) {
        await this.app.workspace.openLinkText(source.note_path, '', true);
      }
    });
    
    buttonDiv.createEl('button', { text: '删除', cls: 'mod-warning' }).addEventListener('click', () => {
      if (confirm(`确定要删除 ${source.title} 的同步记录吗？`)) {
        this.plugin.store.deleteSource(source.source_key);
        item.remove();
      }
    });

    // 点击展开/折叠
    header.addEventListener('click', () => {
      details.classList.toggle('hidden');
      expandIcon.textContent = details.classList.contains('hidden') ? '▶' : '▼';
    });
  }

  private async startSync(): Promise<void> {
    if (!this.urlInput || !this.statusDiv) return;

    const url = this.urlInput.value.trim();
    if (!url) {
      new Notice('请输入B站链接');
      return;
    }

    const categoryPath = this.selectedPath;
    if (!categoryPath) {
      new Notice('请选择目标分类目录');
      return;
    }

    this.statusDiv.setText('执行中...');
    this.urlInput.disabled = true;

    try {
      this.appendLog(`开始处理：${url}`);

      const result = await this.plugin.importUrl(url, categoryPath, (message: string) => {
        this.appendLog(message);
      });

      if (this.statusDiv) {
        this.statusDiv.setText('完成');
      }
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
      if (this.statusDiv) {
        this.statusDiv.setText('失败');
      }
      this.appendLog(`失败：${error.message}`);
      new Notice(`同步失败：${error.message}`);
    } finally {
      if (this.urlInput) {
        this.urlInput.disabled = false;
      }
    }
  }

  async onClose(): Promise<void> {
    // 清理资源
  }
}
