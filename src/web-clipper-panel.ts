import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { WebClipper, WebClipResult } from './web-clipper';
import BilibiliSyncPlugin from '../main';

export const VIEW_TYPE_WEB_CLIPPER = 'web-clipper-view';

export class WebClipperPanel extends ItemView {
  plugin: BilibiliSyncPlugin;
  private urlInput: HTMLInputElement;
  private targetInput: HTMLInputElement;
  private statusDiv: HTMLDivElement;
  private logDiv: HTMLDivElement;
  private webClipper: WebClipper;

  constructor(leaf: WorkspaceLeaf, plugin: BilibiliSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.webClipper = new WebClipper(this.app.vault);
  }

  getViewType(): string {
    return VIEW_TYPE_WEB_CLIPPER;
  }

  getDisplayText(): string {
    return '网页剪藏';
  }

  getIcon(): string {
    return 'globe';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('web-clipper-container');

    // 标题
    const titleEl = container.createEl('div', { cls: 'web-clipper-title' });
    titleEl.createEl('h2', { text: '网页剪藏到 Obsidian' });

    // URL 输入区域
    const urlSection = container.createEl('div', { cls: 'form-section' });
    urlSection.createEl('label', { text: '网页地址', cls: 'form-label' });
    this.urlInput = urlSection.createEl('input', {
      type: 'text',
      cls: 'form-input',
      placeholder: '输入网页地址，如 https://zhuanlan.zhihu.com/p/xxx',
    });

    // 目标目录
    const targetSection = container.createEl('div', { cls: 'form-section' });
    targetSection.createEl('label', { text: '保存目录', cls: 'form-label' });
    this.targetInput = targetSection.createEl('input', {
      type: 'text',
      cls: 'form-input',
      placeholder: '输入保存目录，如 网页剪藏',
    });

    // 按钮区域
    const buttonDiv = container.createEl('div', { cls: 'button-group' });
    buttonDiv.createEl('button', { text: '开始剪藏', cls: 'mod-cta' }).addEventListener('click', () => {
      this.startClip();
    });
    buttonDiv.createEl('button', { text: '清空日志' }).addEventListener('click', () => {
      if (this.logDiv) this.logDiv.empty();
    });

    // 状态显示
    this.statusDiv = container.createEl('div', { text: '准备就绪', cls: 'web-clipper-status' });

    // 日志区域
    this.logDiv = container.createEl('div', { cls: 'web-clipper-log' });
  }

  async onClose(): Promise<void> {
    // 清理
  }

  private appendLog(message: string): void {
    const time = new Date().toLocaleTimeString();
    this.logDiv.createEl('div', { text: `[${time}] ${message}` });
    this.logDiv.scrollTop = this.logDiv.scrollHeight;
  }

  private async startClip(): Promise<void> {
    const url = this.urlInput.value.trim();
    if (!url) {
      new Notice('请输入网页地址');
      return;
    }

    const targetDir = this.targetInput.value.trim() || '网页剪藏';

    this.statusDiv.setText('剪藏中...');
    this.urlInput.disabled = true;
    this.targetInput.disabled = true;

    try {
      this.appendLog(`开始剪藏：${url}`);

      const result = await this.webClipper.clipUrl(url);
      this.appendLog(`解析完成：${result.title}`);

      const notePath = await this.webClipper.saveAsNote(result, targetDir);
      this.appendLog(`保存成功：${notePath}`);

      if (this.statusDiv) {
        this.statusDiv.setText('完成');
      }

      new Notice(`剪藏完成：${result.title}`);

      // 打开生成的笔记
      const noteFile = this.app.vault.getAbstractFileByPath(notePath);
      if (noteFile instanceof TFile) {
        await this.app.workspace.openLinkText(notePath, '', true);
      }

    } catch (error) {
      if (this.statusDiv) {
        this.statusDiv.setText('失败');
      }
      this.appendLog(`失败：${error.message}`);
      new Notice(`剪藏失败：${error.message}`);
    } finally {
      if (this.urlInput) {
        this.urlInput.disabled = false;
      }
      if (this.targetInput) {
        this.targetInput.disabled = false;
      }
    }
  }
}
