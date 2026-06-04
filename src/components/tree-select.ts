import { Vault, TFolder, TFile } from 'obsidian';

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  isFolder: boolean;
}

export class TreeSelectComponent {
  private container: HTMLElement;
  private vault: Vault;
  private root: TreeNode;
  private selectedPath: string = '';
  private excludedDirs: string[];
  private basePath: string;
  private onSelectionChange: (path: string) => void;
  private treeContainer: HTMLElement;

  constructor(
    container: HTMLElement,
    vault: Vault,
    excludedDirs: string[] = [],
    basePath: string = '',
    onSelectionChange: (path: string) => void = () => {}
  ) {
    this.container = container;
    this.vault = vault;
    this.excludedDirs = excludedDirs;
    this.basePath = basePath;
    this.onSelectionChange = onSelectionChange;
    this.root = this.buildTree();
    this.render();
  }

  private buildTree(): TreeNode {
    let rootFolder: TFolder;
    
    if (this.basePath) {
      const baseFile = this.vault.getAbstractFileByPath(this.basePath);
      if (baseFile instanceof TFolder) {
        rootFolder = baseFile;
      } else {
        rootFolder = this.vault.getRoot();
      }
    } else {
      rootFolder = this.vault.getRoot();
    }
    
    return this.buildNode(rootFolder, '', true);
  }

  private buildNode(folder: TFolder, parentPath: string, isRoot: boolean = false): TreeNode {
    const path = parentPath ? `${parentPath}/${folder.name}` : folder.name;
    const children: TreeNode[] = [];

    // 检查是否在排除列表中
    if (!isRoot && this.isExcluded(path)) {
      return {
        name: folder.name,
        path,
        children: [],
        isExpanded: false,
        isSelected: false,
        isFolder: true,
      };
    }

    // 添加子文件夹
    for (const child of folder.children) {
      if (child instanceof TFolder && !child.name.startsWith('.')) {
        children.push(this.buildNode(child, isRoot ? '' : path));
      }
    }

    // 按名称排序
    children.sort((a, b) => a.name.localeCompare(b.name));

    return {
      name: folder.name || '根目录',
      path: isRoot ? '' : (path || ''),
      children,
      isExpanded: isRoot, // 默认展开第一层
      isSelected: false,
      isFolder: true,
    };
  }

  private isExcluded(path: string): boolean {
    // 获取完整路径（考虑basePath）
    const fullPath = this.basePath ? `${this.basePath}/${path}` : path;
    
    return this.excludedDirs.some(excluded => {
      // 构建可能的完整排除路径
      const fullExcludedPath = this.basePath && !excluded.startsWith(this.basePath) 
        ? `${this.basePath}/${excluded}` 
        : excluded;
      
      // 检查完整路径或相对路径是否匹配
      return fullPath === fullExcludedPath || 
             fullPath.startsWith(fullExcludedPath + '/') ||
             fullPath === excluded || 
             fullPath.startsWith(excluded + '/') ||
             path === excluded || 
             path.startsWith(excluded + '/');
    });
  }

  render(): void {
    this.container.empty();
    this.treeContainer = this.container.createEl('div', {
      cls: 'tree-select-container',
    });
    this.renderNode(this.root, this.treeContainer, 0);
  }

  private renderNode(node: TreeNode, container: HTMLElement, level: number): void {
    const nodeEl = container.createEl('div', {
      cls: `tree-node ${node.isSelected ? 'tree-node-selected' : ''}`,
    });

    const contentEl = nodeEl.createEl('div', {
      cls: 'tree-node-content',
    });

    // 缩进
    contentEl.createEl('span', {
      cls: 'tree-node-indent',
      text: '  '.repeat(level),
    });

    // 展开/折叠图标
    if (node.children.length > 0) {
      const expandIcon = contentEl.createEl('span', {
        cls: `tree-node-expand-icon ${node.isExpanded ? 'expanded' : ''}`,
        text: node.isExpanded ? '▼' : '▶',
      });
      expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        node.isExpanded = !node.isExpanded;
        this.rerender();
      });
    } else {
      contentEl.createEl('span', {
        cls: 'tree-node-expand-icon',
        text: '  ',
      });
    }

    // 文件夹图标
    contentEl.createEl('span', {
      cls: 'tree-node-icon',
      text: '📁',
    });

    // 名称
    const nameEl = contentEl.createEl('span', {
      cls: 'tree-node-name',
      text: node.name,
    });

    // 点击选择
    contentEl.addEventListener('click', () => {
      this.selectNode(node);
    });

    // 渲染子节点
    if (node.isExpanded && node.children.length > 0) {
      const childrenEl = nodeEl.createEl('div', {
        cls: 'tree-node-children',
      });
      for (const child of node.children) {
        this.renderNode(child, childrenEl, level + 1);
      }
    }
  }

  private selectNode(node: TreeNode): void {
    // 清除之前的选中状态
    this.clearSelection(this.root);
    
    // 设置新的选中状态
    node.isSelected = true;
    this.selectedPath = node.path;
    
    // 重新渲染
    this.rerender();
    
    // 触发回调 - 返回完整路径（包含 basePath）
    const fullPath = this.basePath && node.path 
      ? `${this.basePath}/${node.path}` 
      : node.path;
    this.onSelectionChange(fullPath);
  }

  private clearSelection(node: TreeNode): void {
    node.isSelected = false;
    for (const child of node.children) {
      this.clearSelection(child);
    }
  }

  private rerender(): void {
    this.render();
  }

  expandAll(): void {
    this.expandNode(this.root);
    this.rerender();
  }

  private expandNode(node: TreeNode): void {
    node.isExpanded = true;
    for (const child of node.children) {
      this.expandNode(child);
    }
  }

  collapseAll(): void {
    this.collapseNode(this.root);
    this.root.isExpanded = true;
    this.rerender();
  }

  private collapseNode(node: TreeNode): void {
    node.isExpanded = false;
    for (const child of node.children) {
      this.collapseNode(child);
    }
  }

  getSelectedPath(): string {
    return this.selectedPath;
  }

  setSelectedPath(path: string): void {
    this.selectedPath = path;
    this.setSelectionByPath(this.root, path);
    this.rerender();
  }

  private setSelectionByPath(node: TreeNode, path: string): boolean {
    // 尝试匹配完整路径或相对路径
    const relativePath = this.basePath && path.startsWith(this.basePath + '/')
      ? path.substring(this.basePath.length + 1)
      : path;
    
    if (node.path === relativePath) {
      node.isSelected = true;
      return true;
    }
    
    for (const child of node.children) {
      if (this.setSelectionByPath(child, path)) {
        node.isExpanded = true;
        return true;
      }
    }
    
    return false;
  }

  setExcludedDirs(excludedDirs: string[]): void {
    this.excludedDirs = excludedDirs;
    this.root = this.buildTree();
    this.rerender();
  }

  setBasePath(basePath: string): void {
    this.basePath = basePath;
    this.root = this.buildTree();
    this.rerender();
  }
}
