import { TFile, TFolder, Vault, requestUrl } from 'obsidian';

export interface WebClipResult {
  title: string;
  content: string;
  images: { url: string; localPath: string }[];
  sourceUrl: string;
  author?: string;
  publishDate?: string;
}

export class WebClipper {
  private vault: Vault;
  private imageFolder: string;

  constructor(vault: Vault, imageFolder: string = '附件/网页剪藏') {
    this.vault = vault;
    this.imageFolder = imageFolder;
  }

  async clipUrl(url: string): Promise<WebClipResult> {
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    const html = response.text;
    return this.parseHtml(html, url);
  }

  private async parseHtml(html: string, sourceUrl: string): Promise<WebClipResult> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title = doc.querySelector('title')?.textContent || '未命名文章';
    const content = doc.querySelector('article, .Post-RichTextContainer, .RichContent-inner, main')?.innerHTML || '';
    const author = doc.querySelector('.AuthorInfo-name, .UserLink-link')?.textContent || '';
    const publishDate = doc.querySelector('.ContentItem-time, time')?.textContent || '';

    const images = await this.extractImages(doc, sourceUrl);

    return {
      title,
      content: this.htmlToMarkdown(content, images),
      images,
      sourceUrl,
      author,
      publishDate,
    };
  }

  private async extractImages(doc: Document, sourceUrl: string): Promise<{ url: string; localPath: string }[]> {
    const images: { url: string; localPath: string }[] = [];
    const imgElements = doc.querySelectorAll('img');
    const imgArray = Array.from(imgElements);

    for (const img of imgArray) {
      const src = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const absoluteUrl = this.resolveUrl(src, sourceUrl);
        const localPath = await this.downloadImage(absoluteUrl);
        images.push({ url: absoluteUrl, localPath });
      }
    }

    return images;
  }

  private resolveUrl(url: string, base: string): string {
    try {
      return new URL(url, base).href;
    } catch {
      return url;
    }
  }

  private async downloadImage(url: string): Promise<string> {
    const response = await requestUrl({ url });
    const buffer = response.arrayBuffer;
    
    const ext = this.getExtension(url);
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
    const filepath = `${this.imageFolder}/${filename}`;

    await this.ensureFolder(this.imageFolder);
    await this.vault.createBinary(filepath, buffer);

    return filepath;
  }

  private getExtension(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = this.vault.getAbstractFileByPath(current);
      if (!folder) {
        await this.vault.createFolder(current);
      }
    }
  }

  private htmlToMarkdown(html: string, images: { url: string; localPath: string }[]): string {
    let markdown = html;

    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');

    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');

    markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1\n');
    markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1\n');
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    for (const img of images) {
      markdown = markdown.replace(new RegExp(`<img[^>]*src="${this.escapeRegex(img.url)}"[^>]*/?>`, 'g'), `![](${img.localPath})`);
    }

    markdown = markdown.replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, '$1');
    markdown = markdown.replace(/<figcaption[^>]*>(.*?)<\/figcaption>/gi, '\n*$1*\n');

    markdown = markdown.replace(/<[^>]+>/g, '');

    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&quot;/g, '"');

    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown.trim();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async saveAsNote(result: WebClipResult, targetDir: string): Promise<string> {
    const filename = this.sanitizeFilename(result.title) + '.md';
    const filepath = `${targetDir}/${filename}`;

    await this.ensureFolder(targetDir);

    const frontmatter = [
      '---',
      `title: "${result.title}"`,
      `source: "${result.sourceUrl}"`,
      result.author ? `author: "${result.author}"` : '',
      result.publishDate ? `date: "${result.publishDate}"` : '',
      `clipped: "${new Date().toISOString()}"`,
      '---',
      '',
    ].filter(Boolean).join('\n');

    const content = frontmatter + result.content;

    const existingFile = this.vault.getAbstractFileByPath(filepath);
    if (existingFile instanceof TFile) {
      await this.vault.modify(existingFile, content);
    } else {
      await this.vault.create(filepath, content);
    }

    return filepath;
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
  }
}
