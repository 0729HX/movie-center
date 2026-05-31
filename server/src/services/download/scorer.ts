/**
 * ResourceScorer -- 资源质量评分引擎
 *
 * 从文件名中提取分辨率/编码/音频/字幕信息并评分
 * 返回 0-115 分, 用于排序和阈值过滤
 */

// ======================== 类型定义 ========================

export interface ResourceMeta {
  resolution: string;   // '4K' | '1080p' | '720p' | '480p' | 'unknown'
  encoding: string;     // 'Remux' | 'BluRay' | 'WEB-DL' | 'HDTV' | 'DVDRip' | 'HDRip' | 'TS' | 'unknown'
  audio: string;        // 'Atmos' | 'TrueHD' | 'DTS-HD' | 'DTS' | 'DD' | 'FLAC' | 'AAC' | 'unknown'
  subtitle: string;     // '内封中字' | '外挂中字' | '外挂' | 'none'
  sizeGB: number;
}

export interface QuarkResource {
  /** 资源标题 (文件名) */
  title: string;
  /** 文件大小(字节) */
  size: number;
  /** 夸克分享链接 */
  shareUrl: string;
  /** 文件 ID (fid) */
  fid: string;
  /** 转存后的下载直链 */
  downloadUrl?: string;
}

export interface ScoredResource {
  resource: QuarkResource;
  meta: ResourceMeta;
  score: number;
}

// ======================== 元数据解析 ========================

/**
 * 从资源标题中提取元数据
 */
export function parseResourceMeta(title: string, sizeBytes: number): ResourceMeta {
  // 分辨率
  let resolution = 'unknown';
  if (/2160[pP]|4[Kk]|UHD/i.test(title)) resolution = '4K';
  else if (/1080[pPiI]/i.test(title)) resolution = '1080p';
  else if (/720[pP]/i.test(title)) resolution = '720p';
  else if (/480[pP]|SD/i.test(title)) resolution = '480p';

  // 编码来源
  let encoding = 'unknown';
  if (/remux/i.test(title)) encoding = 'Remux';
  else if (/blu[-.]?ray|bdrip|bdremux/i.test(title)) encoding = 'BluRay';
  else if (/web[-.]?dl|webrip/i.test(title)) encoding = 'WEB-DL';
  else if (/hdtv/i.test(title)) encoding = 'HDTV';
  else if (/dvdrip|dvd/i.test(title)) encoding = 'DVDRip';
  else if (/hdrip|hc/i.test(title)) encoding = 'HDRip';
  else if (/ts|tc|cam/i.test(title)) encoding = 'TS';

  // 音频
  let audio = 'unknown';
  if (/atmos|全景声/i.test(title)) audio = 'Atmos';
  else if (/truehd|true.hd/i.test(title)) audio = 'TrueHD';
  else if (/dts[-.]?hd|dts[-.]?ma/i.test(title)) audio = 'DTS-HD';
  else if (/dts/i.test(title)) audio = 'DTS';
  else if (/dd\+?|dolby|ac3|eac3/i.test(title)) audio = 'DD';
  else if (/aac/i.test(title)) audio = 'AAC';
  else if (/flac/i.test(title)) audio = 'FLAC';

  // 字幕
  let subtitle = 'none';
  if (/内封|内嵌|内嵌中字|chs|cht|简繁/i.test(title)) subtitle = '内封中字';
  else if (/中字|中英|双语|sub|字幕/i.test(title)) subtitle = '外挂中字';
  else if (/字幕/i.test(title)) subtitle = '外挂';

  return {
    resolution,
    encoding,
    audio,
    subtitle,
    sizeGB: sizeBytes / (1024 * 1024 * 1024),
  };
}

// ======================== 评分逻辑 ========================

/**
 * 对单个资源评分
 *
 * 评分维度 (满分约115):
 *   分辨率: 4K(+40), 1080p(+30), 720p(+10)
 *   编码:   Remux(+30), BluRay(+25), WEB-DL(+15), HDTV(+5)
 *   音频:   Atmos(+15), DTS-HD(+12), DTS(+10), AAC(+5)
 *   字幕:   内封中字(+20), 外挂中字(+10)
 *   大小:   合理范围(+10), 过小(-10)
 */
export function scoreResource(meta: ResourceMeta): number {
  let score = 0;

  // 分辨率 (0-40)
  switch (meta.resolution) {
    case '4K':    score += 40; break;
    case '1080p': score += 30; break;
    case '720p':  score += 10; break;
  }

  // 编码 (0-30)
  switch (meta.encoding) {
    case 'Remux':   score += 30; break;
    case 'BluRay':  score += 25; break;
    case 'WEB-DL':  score += 15; break;
    case 'HDTV':    score += 5;  break;
    case 'HDRip':   score += 8;  break;
    case 'DVDRip':  score += 5;  break;
  }

  // 音频 (0-15)
  switch (meta.audio) {
    case 'Atmos':   score += 15; break;
    case 'TrueHD':  score += 13; break;
    case 'DTS-HD':  score += 12; break;
    case 'DTS':     score += 10; break;
    case 'DD':      score += 7;  break;
    case 'FLAC':    score += 8;  break;
    case 'AAC':     score += 5;  break;
  }

  // 字幕 (0-20)
  switch (meta.subtitle) {
    case '内封中字': score += 20; break;
    case '外挂中字': score += 10; break;
    case '外挂':     score += 5;  break;
  }

  // 文件大小合理性 (-10 ~ +10)
  if (meta.resolution === '4K' && meta.sizeGB >= 15 && meta.sizeGB <= 120) {
    score += 10;
  } else if (meta.resolution === '1080p' && meta.sizeGB >= 4 && meta.sizeGB <= 50) {
    score += 10;
  } else if (meta.sizeGB < 0.5) {
    score -= 10; // 太小, 可能是低质量
  } else if (meta.sizeGB > 150) {
    score -= 5; // 异常大
  }

  return score;
}

// ======================== 排序与过滤 ========================

/**
 * 对资源列表评分并排序
 *
 * @param resources 待评分资源列表
 * @param minScore 最低分数阈值 (低于此分数的资源会被过滤)
 * @returns 排序后的评分资源列表 (分数高→低)
 */
export function rankResources(resources: QuarkResource[], minScore: number = 0): ScoredResource[] {
  const scored: ScoredResource[] = resources
    .map(r => {
      const meta = parseResourceMeta(r.title, r.size);
      const score = scoreResource(meta);
      return { resource: r, meta, score };
    })
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * 根据用户偏好关键词加权
 *
 * 例如用户配置 prefer_quality = '4K,BluRay,Remux'
 * 匹配的资源额外加分
 */
export function applyPreferenceBonus(
  scored: ScoredResource[],
  preferQuality: string,
): ScoredResource[] {
  if (!preferQuality) return scored;

  const keywords = preferQuality.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

  return scored.map(s => {
    const titleLower = s.resource.title.toLowerCase();
    let bonus = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) {
        bonus += 5;
      }
    }
    return { ...s, score: s.score + bonus };
  }).sort((a, b) => b.score - a.score);
}
