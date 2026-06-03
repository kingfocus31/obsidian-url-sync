import { requestUrl } from 'obsidian';

export interface UpInfo {
  mid: string;
  up_name: string;
  up_url: string;
}

export interface ImportTarget {
  source_type: string;
  source_id: string;
  mid: string;
  up_name: string;
  title: string;
  source_url: string;
  source_key: string;
}

export interface Video {
  bvid: string;
  oid: number;
  title: string;
  url: string;
  pubdate: number;
  duration_seconds: number;
  view_count: number;
  source_kind: string;
}

export interface Collection {
  title: string;
  season_id?: string;
  series_id?: string;
  total: number;
}

export class BilibiliClient {
  private headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www.bilibili.com/',
  };

  async resolveTarget(rawUrl: string): Promise<ImportTarget> {
    const finalUrl = await this.followShortUrl(rawUrl.trim());
    const parsed = new URL(finalUrl);
    
    if (parsed.hostname === 'space.bilibili.com') {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (!match) {
        throw new Error('无法从 UP 主页链接中解析 mid。');
      }
      const mid = match[1];
      const listMatch = parsed.pathname.match(/\/lists\/(\d+)/);
      const listType = parsed.searchParams.get('type') || '';
      
      if (listMatch && (listType === 'season' || listType === 'series')) {
        const listId = listMatch[1];
        return this.resolveCollectionTarget(mid, listId, listType);
      }
      
      const initial = await this.fetchListInitialState(mid);
      const upName = ((initial?.mediaListInfo?.upper)?.name) || initial?.mediaListInfo?.title || mid;
      const upUrl = `https://space.bilibili.com/${mid}/upload/video`;
      
      return {
        source_type: 'up',
        source_id: mid,
        mid,
        up_name: upName,
        title: upName,
        source_url: upUrl,
        source_key: `up:${mid}`,
      };
    }
    
    if (parsed.hostname === 'www.bilibili.com' && parsed.pathname.includes('/video/')) {
      const bvidMatch = parsed.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
      if (!bvidMatch) {
        throw new Error('无法从视频链接中解析 BV 号。');
      }
      const up = await this.resolveUpFromBvid(bvidMatch[1]);
      return {
        source_type: 'up',
        source_id: up.mid,
        mid: up.mid,
        up_name: up.up_name,
        title: up.up_name,
        source_url: up.up_url,
        source_key: `up:${up.mid}`,
      };
    }
    
    throw new Error('仅支持 B 站 UP 主页链接、投稿页链接或视频链接。');
  }

  async resolveCollectionTarget(mid: string, listId: string, listType: string): Promise<ImportTarget> {
    if (listType === 'season') {
      const meta = await this.fetchSeasonPage(listId, 1, 1);
      const info = meta.info || {};
      const upName = (info.upper || {}).name || mid;
      const title = info.title || `season-${listId}`;
      return {
        source_type: 'season',
        source_id: listId,
        mid,
        up_name: upName,
        title,
        source_url: `https://space.bilibili.com/${mid}/lists/${listId}?type=season`,
        source_key: `season:${listId}`,
      };
    }
    
    const meta = await this.fetchSeriesMeta(listId);
    const upName = (meta.meta || {}).name || mid;
    const title = meta.meta?.title || `series-${listId}`;
    const ownerMid = String(meta.meta?.mid || mid);
    
    return {
      source_type: 'series',
      source_id: listId,
      mid: ownerMid,
      up_name: upName,
      title,
      source_url: `https://space.bilibili.com/${ownerMid}/lists/${listId}?type=series`,
      source_key: `series:${listId}`,
    };
  }

  async resolveUpFromBvid(bvid: string): Promise<UpInfo> {
    const payload = await this.getJson(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid },
      'https://www.bilibili.com/'
    );
    
    const owner = payload.data?.owner || {};
    const mid = String(owner.mid || '');
    const upName = owner.name || mid;
    
    if (!mid) {
      throw new Error('视频详情里没有找到所属 UP 主。');
    }
    
    return {
      mid,
      up_name: upName,
      up_url: `https://space.bilibili.com/${mid}/upload/video`,
    };
  }

  async fetchTargetVideos(target: ImportTarget): Promise<{ target: ImportTarget; videos: Video[]; collections: Collection[] }> {
    if (target.source_type === 'up') {
      const { upName, videos, collections } = await this.fetchAllUploadVideos(target.mid);
      target.up_name = upName || target.up_name;
      target.title = target.up_name;
      return { target, videos, collections };
    }
    
    if (target.source_type === 'season') {
      const videos = await this.fetchAllSeasonVideos(target.source_id);
      return { target, videos, collections: [] };
    }
    
    if (target.source_type === 'series') {
      const videos = await this.fetchAllSeriesVideos(target.mid, target.source_id);
      return { target, videos, collections: [] };
    }
    
    throw new Error(`暂不支持的导入类型：${target.source_type}`);
  }

  async fetchAllUploadVideos(mid: string): Promise<{ upName: string; videos: Video[]; collections: Collection[] }> {
    const initial = await this.fetchListInitialState(mid);
    const mediaInfo = initial?.mediaListInfo || {};
    const upName = ((mediaInfo.upper || {}).name || mediaInfo.title || mid).trim();
    const total = parseInt(initial?.listTotal || mediaInfo.media_count || '0');
    const seedList = initial?.resourceList || [];
    
    if (!seedList.length) {
      throw new Error('未从列表页读取到公开视频列表。');
    }
    
    const firstSeed = seedList[0];
    const currentBatch = await this.fetchUploadBatchWithCurrent(mid, firstSeed.bvid, firstSeed.oid);
    const seen = new Map<string, Video>();
    
    for (const item of currentBatch) {
      seen.set(item.bvid, item);
    }
    
    let cursor = currentBatch[currentBatch.length - 1];
    
    while (cursor && seen.size < total) {
      const { batch, hasMore } = await this.fetchUploadBatch(mid, cursor.bvid, cursor.oid);
      const fresh = batch.filter(item => !seen.has(item.bvid));
      
      if (!fresh.length) break;
      
      for (const item of fresh) {
        seen.set(item.bvid, item);
      }
      
      cursor = fresh[fresh.length - 1];
      if (!hasMore) break;
    }
    
    const videos = Array.from(seen.values()).sort((a, b) => {
      const dateDiff = b.pubdate - a.pubdate;
      return dateDiff !== 0 ? dateDiff : b.bvid.localeCompare(a.bvid);
    });
    
    const collections = await this.fetchCollectionsMeta(mid);
    
    return { upName, videos, collections };
  }

  async fetchUploadBatchWithCurrent(mid: string, cursorBvid: string, cursorOid: number): Promise<Video[]> {
    const params = new URLSearchParams({
      mobi_app: 'web',
      type: '1',
      biz_id: mid,
      ps: '20',
      desc: 'true',
      sort_field: '1',
      tid: '0',
      bvid: cursorBvid,
      oid: String(cursorOid),
      otype: '2',
      with_current: 'true',
      direction: 'false',
      preview: '0',
    });
    
    const payload = await this.getJson(
      `https://api.bilibili.com/x/v2/medialist/resource/list?${params.toString()}`,
      undefined,
      `https://www.bilibili.com/list/${mid}?sort_field=pubdate`
    );
    
    const data = payload.data || {};
    return (data.media_list || []).map(this.normalizeMediaListItem);
  }

  async fetchUploadBatch(mid: string, cursorBvid: string, cursorOid: number): Promise<{ batch: Video[]; hasMore: boolean }> {
    const params = new URLSearchParams({
      mobi_app: 'web',
      type: '1',
      biz_id: mid,
      ps: '20',
      desc: 'true',
      sort_field: '1',
      tid: '0',
      bvid: cursorBvid,
      oid: String(cursorOid),
      otype: '2',
      with_current: 'false',
      direction: 'false',
      preview: '0',
    });
    
    const payload = await this.getJson(
      `https://api.bilibili.com/x/v2/medialist/resource/list?${params.toString()}`,
      undefined,
      `https://www.bilibili.com/list/${mid}?sort_field=pubdate`
    );
    
    const data = payload.data || {};
    const batch = (data.media_list || []).map(this.normalizeMediaListItem);
    
    return { batch, hasMore: Boolean(data.has_more) };
  }

  async fetchCollectionsMeta(mid: string): Promise<Collection[]> {
    const params = new URLSearchParams({
      mid,
      page_num: '1',
      page_size: '20',
    });
    
    const payload = await this.getJson(
      `https://api.bilibili.com/x/polymer/web-space/seasons_series_list?${params.toString()}`,
      undefined,
      `https://space.bilibili.com/${mid}/upload/video`
    );
    
    const data = payload.data?.items_lists || {};
    const collections: Collection[] = [];
    
    for (const season of data.seasons_list || []) {
      const meta = season.meta || {};
      const title = meta.title || meta.name;
      if (!title) continue;
      
      collections.push({
        title,
        season_id: String(meta.season_id || ''),
        total: parseInt(meta.total || '0'),
      });
    }
    
    for (const series of data.series_list || []) {
      const meta = series.meta || {};
      const title = meta.title || meta.name;
      if (!title) continue;
      
      collections.push({
        title,
        series_id: String(meta.series_id || ''),
        total: parseInt(meta.total || '0'),
      });
    }
    
    return collections;
  }

  async fetchSeasonPage(seasonId: string, pn: number, ps: number): Promise<any> {
    const params = new URLSearchParams({
      season_id: seasonId,
      pn: String(pn),
      ps: String(ps),
    });
    
    const payload = await this.getJson(
      `https://api.bilibili.com/x/space/fav/season/list?${params.toString()}`,
      undefined,
      'https://www.bilibili.com/'
    );
    
    return payload.data || {};
  }

  async fetchAllSeasonVideos(seasonId: string): Promise<Video[]> {
    const firstPage = await this.fetchSeasonPage(seasonId, 1, 20);
    const info = firstPage.info || {};
    const total = parseInt(info.media_count || '0');
    const videos = (firstPage.medias || []).map(this.normalizeSeasonMedia);
    const seen = new Map<string, Video>();
    
    for (const item of videos) {
      seen.set(item.bvid, item);
    }
    
    const totalPages = Math.max(1, Math.ceil(total / 20));
    
    for (let pn = 2; pn <= totalPages; pn++) {
      const page = await this.fetchSeasonPage(seasonId, pn, 20);
      for (const item of page.medias || []) {
        const normalized = this.normalizeSeasonMedia(item);
        if (!seen.has(normalized.bvid)) {
          seen.set(normalized.bvid, normalized);
        }
      }
    }
    
    return Array.from(seen.values()).sort((a, b) => {
      const dateDiff = b.pubdate - a.pubdate;
      return dateDiff !== 0 ? dateDiff : b.bvid.localeCompare(a.bvid);
    });
  }

  async fetchSeriesMeta(seriesId: string): Promise<any> {
    const params = new URLSearchParams({
      series_id: seriesId,
    });
    
    const payload = await this.getJson(
      `https://api.bilibili.com/x/series/series?${params.toString()}`,
      undefined,
      'https://www.bilibili.com/'
    );
    
    return payload.data || {};
  }

  async fetchAllSeriesVideos(mid: string, seriesId: string): Promise<Video[]> {
    const meta = await this.fetchSeriesMeta(seriesId);
    const total = parseInt(meta.meta?.total || '0');
    const seen = new Map<string, Video>();
    const totalPages = Math.max(1, Math.ceil(total / 20));
    
    for (let pn = 1; pn <= totalPages; pn++) {
      const params = new URLSearchParams({
        mid,
        series_id: seriesId,
        only_normal: 'true',
        sort: 'desc',
        pn: String(pn),
        ps: '20',
      });
      
      const payload = await this.getJson(
        `https://api.bilibili.com/x/series/archives?${params.toString()}`,
        undefined,
        'https://www.bilibili.com/'
      );
      
      for (const item of payload.data?.archives || []) {
        const normalized = this.normalizeSeriesArchive(item);
        if (!seen.has(normalized.bvid)) {
          seen.set(normalized.bvid, normalized);
        }
      }
    }
    
    return Array.from(seen.values()).sort((a, b) => {
      const dateDiff = b.pubdate - a.pubdate;
      return dateDiff !== 0 ? dateDiff : b.bvid.localeCompare(a.bvid);
    });
  }

  private async followShortUrl(rawUrl: string): Promise<string> {
    if (!rawUrl) {
      throw new Error('请输入 B 站链接。');
    }
    
    if (rawUrl.includes('b23.tv')) {
      const response = await requestUrl({
        url: rawUrl,
        method: 'GET',
        headers: this.headers,
      });
      return (response as any).url || rawUrl;
    }
    
    return rawUrl;
  }

  private async fetchListInitialState(mid: string): Promise<any> {
    const url = `https://www.bilibili.com/list/${mid}?sort_field=pubdate`;
    const html = await this.getText(url, 'https://www.bilibili.com/');
    
    const match = html.match(/__INITIAL_STATE__\s*=\s*({.*?});\s*\(function/s);
    if (!match) {
      throw new Error('未能从 B 站列表页解析出初始数据。');
    }
    
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      throw new Error('解析 B 站列表页初始数据失败。');
    }
  }

  private async getText(url: string, referer?: string): Promise<string> {
    const headers = { ...this.headers };
    if (referer) {
      headers.Referer = referer;
    }
    
    const response = await requestUrl({
      url,
      method: 'GET',
      headers,
    });
    
    return response.text;
  }

  private normalizeMediaListItem(item: any): Video {
    const bvid = item.bv_id || item.bvid;
    const oid = parseInt(item.id || item.aid || '0');
    
    return {
      bvid,
      oid,
      title: item.title || '',
      url: `https://www.bilibili.com/video/${bvid}`,
      pubdate: parseInt(item.pubtime || '0'),
      duration_seconds: parseInt(item.duration || '0'),
      view_count: parseInt(item.cnt_info?.play || '0'),
      source_kind: 'upload',
    };
  }

  private normalizeSeasonMedia(item: any): Video {
    const bvid = item.bvid;
    const aid = parseInt(item.id || item.aid || '0');
    
    return {
      bvid,
      oid: aid,
      title: item.title || '',
      url: `https://www.bilibili.com/video/${bvid}`,
      pubdate: parseInt(item.pubtime || item.pubdate || '0'),
      duration_seconds: parseInt(item.duration || '0'),
      view_count: parseInt(item.cnt_info?.play || '0'),
      source_kind: 'season',
    };
  }

  private normalizeSeriesArchive(item: any): Video {
    const bvid = item.bvid;
    const aid = parseInt(item.aid || '0');
    
    return {
      bvid,
      oid: aid,
      title: item.title || '',
      url: `https://www.bilibili.com/video/${bvid}`,
      pubdate: parseInt(item.pubdate || '0'),
      duration_seconds: parseInt(item.duration || '0'),
      view_count: parseInt(item.stat?.view || '0'),
      source_kind: 'series',
    };
  }

  private async getJson(url: string, params?: Record<string, string>, referer?: string): Promise<any> {
    let finalUrl = url;
    
    if (params) {
      const searchParams = new URLSearchParams(params);
      finalUrl += (url.includes('?') ? '&' : '?') + searchParams.toString();
    }
    
    const headers = { ...this.headers };
    if (referer) {
      headers.Referer = referer;
    }
    
    const response = await requestUrl({
      url: finalUrl,
      method: 'GET',
      headers,
    });
    
    const data = response.json;
    const code = data.code || 0;
    
    if (code !== 0) {
      throw new Error(data.message || `B站接口返回异常 code=${code}`);
    }
    
    return data;
  }
}
