import { TFile, TFolder, Vault } from 'obsidian';
import { Video, Collection } from './bilibili-client';

export interface SourceInfo {
  source_key: string;
  source_type: string;
  source_id: string;
  mid: string;
  title: string;
  up_name: string;
  source_url: string;
  target_dir: string;
  note_path: string;
  collections_json: string;
  last_synced_at: string;
  total_video_count: number;
}

function safeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned.substring(0, 120) || '未命名UP主';
}

function escapeMdCell(value: string): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function formatPubdate(pubdate: number): string {
  if (!pubdate || pubdate <= 0) return '';
  const date = new Date(pubdate * 1000);
  return date.toISOString().split('T')[0];
}

export class ObsidianWriter {
  private vault: Vault;
  private indexNoteName: string;

  constructor(vault: Vault, indexNoteName: string) {
    this.vault = vault;
    this.indexNoteName = indexNoteName;
  }

  notePathFor(sourceType: string, title: string, sourceId: string, categoryRel: string): string {
    const prefix = { up: 'B站UP', season: 'B站合集', series: 'B站系列' }[sourceType] || 'B站';
    const basePath = categoryRel ? `${categoryRel}/` : '';
    return `${basePath}${safeFileName(prefix)}-${safeFileName(title)}-${safeFileName(sourceId)}-视频列表.md`;
  }

  async writeChannelNote(
    notePath: string,
    title: string,
    upName: string,
    mid: string,
    sourceUrl: string,
    videos: Video[],
    collections: Collection[],
    categoryRel: string,
    sourceType: string
  ): Promise<void> {
    const syncedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    const lines = [
      `# B站 UP 视频列表 - ${title}`,
      '',
      `- UP主：${upName}`,
      `- MID：${mid}`,
      `- 来源：${sourceUrl}`,
      `- 视频数：${videos.length}`,
      `- 采集时间：${syncedAt}`,
    ];
    
    if (collections.length > 0) {
      const names = collections.map(item => item.title).join('、');
      lines.push(`- 合集信息：${names}`);
    }
    
    lines.push(
      '',
      '|  序号 | 标题 | 地址 | 发布时间 |',
      '| --: | --- | --- | --- |'
    );
    
    videos.forEach((video, index) => {
      const rowTitle = escapeMdCell(video.title);
      const url = video.url;
      const published = formatPubdate(video.pubdate);
      lines.push(`| ${index + 1} | ${rowTitle} | ${url} | ${published} |`);
    });
    
    const content = lines.join('\n') + '\n';
    
    // 确保目录存在
    const parts = notePath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i === 0 ? '' : '/') + parts[i];
      const folder = this.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.vault.createFolder(currentPath);
      }
    }
    
    // 写入或更新文件
    const existingFile = this.vault.getAbstractFileByPath(notePath);
    if (existingFile instanceof TFile) {
      await this.vault.modify(existingFile, content);
    } else {
      await this.vault.create(notePath, content);
    }
  }

  async updateIndexNote(channels: SourceInfo[]): Promise<string> {
    const lines = [
      '# B站UP主同步索引',
      '',
      '| 标题 | UP主 | 来源 | 分类 | 视频数 | 最近同步 |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    
    channels.forEach(item => {
      const title = escapeMdCell(item.title);
      const upName = escapeMdCell(item.up_name);
      const upUrl = item.source_url;
      const category = escapeMdCell(item.target_dir);
      const total = item.total_video_count;
      const synced = escapeMdCell(item.last_synced_at);
      lines.push(`| ${title} | ${upName} | [打开](${upUrl}) | \`${category}\` | ${total} | ${synced} |`);
    });
    
    const content = lines.join('\n') + '\n';
    
    // 确保目录存在
    const parts = this.indexNoteName.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i === 0 ? '' : '/') + parts[i];
      const folder = this.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.vault.createFolder(currentPath);
      }
    }
    
    // 写入或更新文件
    const existingFile = this.vault.getAbstractFileByPath(this.indexNoteName);
    if (existingFile instanceof TFile) {
      await this.vault.modify(existingFile, content);
    } else {
      await this.vault.create(this.indexNoteName, content);
    }
    
    return this.indexNoteName;
  }
}
