#!/bin/bash

# 发布脚本 - 用于构建和发布 Obsidian 插件
# 使用方法: ./release.sh <version>
# 例如: ./release.sh v0.0.3

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "请提供版本号，例如: ./release.sh v0.0.3"
  exit 1
fi

echo "=== 发布 $VERSION ==="

# 1. 构建
echo "1. 构建项目..."
npm run build

# 2. 创建发布目录
echo "2. 创建发布目录..."
rm -rf release
mkdir -p release

# 3. 复制文件
echo "3. 复制文件..."
cp main.js release/
cp manifest.json release/
cp styles.css release/

# 4. 创建 zip 包
echo "4. 创建 zip 包..."
cd release
zip -r "../obsidian-url-sync.zip" .
cd ..

# 5. 更新 manifest.json 版本号
echo "5. 更新版本号..."
VERSION_NUMBER=${VERSION#v}  # 去掉 v 前缀
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION_NUMBER\"/" manifest.json

# 6. 提交更改
echo "6. 提交更改..."
git add -A
git commit -m "chore: release $VERSION" || echo "没有需要提交的更改"

# 7. 创建 tag
echo "7. 创建 tag..."
git tag -a "$VERSION" -m "Release $VERSION" 2>/dev/null || echo "Tag $VERSION 已存在"

# 8. 推送
echo "8. 推送..."
git push
git push origin "$VERSION" 2>/dev/null || echo "Tag 已推送"

echo ""
echo "=== 发布完成 ==="
echo ""
echo "请手动上传以下文件到 GitHub Release:"
echo "  - main.js"
echo "  - manifest.json"
echo "  - styles.css"
echo "  - obsidian-url-sync.zip"
echo ""
echo "访问: https://github.com/kingfocus31/obsidian-url-sync/releases/tag/$VERSION"
