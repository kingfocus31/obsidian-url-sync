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

interface StoredVideo {
  bvid: string;
  oid: number;
  title: string;
  url: string;
  pubdate: number;
  duration_seconds: number;
  view_count: number;
  source_kind: string;
  created_at: string;
}

export class StateStore {
  private storageKey = 'bilibili-sync-state';
  
  private getData(): { sources: Record<string, SourceInfo>; videos: Record<string, StoredVideo[]> } {
    const data = localStorage.getItem(this.storageKey);
    if (!data) {
      return { sources: {}, videos: {} };
    }
    try {
      return JSON.parse(data);
    } catch {
      return { sources: {}, videos: {} };
    }
  }
  
  private setData(data: { sources: Record<string, SourceInfo>; videos: Record<string, StoredVideo[]> }): void {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }
  
  loadVideoMap(sourceKey: string): Record<string, StoredVideo> {
    const data = this.getData();
    const videos = data.videos[sourceKey] || [];
    const map: Record<string, StoredVideo> = {};
    
    for (const video of videos) {
      map[video.bvid] = video;
    }
    
    return map;
  }
  
  upsertVideos(sourceKey: string, videos: Video[]): number {
    const data = this.getData();
    const existingVideos = data.videos[sourceKey] || [];
    const existingBvids = new Set(existingVideos.map(v => v.bvid));
    let newCount = 0;
    
    for (const video of videos) {
      const existing = existingVideos.find(v => v.bvid === video.bvid);
      
      if (existing) {
        existing.oid = video.oid;
        existing.title = video.title;
        existing.url = video.url;
        existing.pubdate = video.pubdate;
        existing.duration_seconds = video.duration_seconds;
        existing.view_count = video.view_count;
        existing.source_kind = video.source_kind;
      } else {
        existingVideos.push({
          ...video,
          created_at: new Date().toISOString(),
        });
        newCount++;
      }
    }
    
    data.videos[sourceKey] = existingVideos;
    this.setData(data);
    
    return newCount;
  }
  
  listVideos(sourceKey: string): Video[] {
    const data = this.getData();
    const videos = data.videos[sourceKey] || [];
    
    return videos.sort((a, b) => {
      const dateDiff = b.pubdate - a.pubdate;
      return dateDiff !== 0 ? dateDiff : b.bvid.localeCompare(a.bvid);
    });
  }
  
  upsertSource(source: SourceInfo): void {
    const data = this.getData();
    data.sources[source.source_key] = source;
    this.setData(data);
  }
  
  listSources(): SourceInfo[] {
    const data = this.getData();
    return Object.values(data.sources).sort((a, b) => {
      const dateDiff = b.last_synced_at.localeCompare(a.last_synced_at);
      return dateDiff !== 0 ? dateDiff : a.title.localeCompare(b.title);
    });
  }
  
  getSource(sourceKey: string): SourceInfo | null {
    const data = this.getData();
    return data.sources[sourceKey] || null;
  }
  
  deleteSource(sourceKey: string): void {
    const data = this.getData();
    delete data.sources[sourceKey];
    delete data.videos[sourceKey];
    this.setData(data);
  }
}
