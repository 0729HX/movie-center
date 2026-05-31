import { describe, it, expect } from 'vitest';
import {
  parseResourceMeta,
  scoreResource,
  rankResources,
  applyPreferenceBonus,
  type QuarkResource,
} from '../scorer';

describe('parseResourceMeta', () => {
  it('应该正确解析 4K Remux 资源', () => {
    const meta = parseResourceMeta(
      'The.Matrix.2160p.UHD.BluRay.Remux.DTS-HD.MA.TrueHD.Atmos.7.1',
      80 * 1024 ** 3
    );
    expect(meta.resolution).toBe('4K');
    expect(meta.encoding).toBe('Remux');
    expect(meta.audio).toBe('Atmos');
    expect(meta.sizeGB).toBeCloseTo(80, 0);
  });

  it('应该正确解析 1080p BluRay 资源', () => {
    const meta = parseResourceMeta(
      '蜘蛛侠.纵横宇宙.2023.1080p.BluRay.x264.DTS.mkv',
      15 * 1024 ** 3
    );
    expect(meta.resolution).toBe('1080p');
    expect(meta.encoding).toBe('BluRay');
    expect(meta.audio).toBe('DTS');
  });

  it('应该正确解析 720p WEB-DL 资源', () => {
    const meta = parseResourceMeta(
      'Movie.720p.WEB-DL.AAC.mp4',
      2 * 1024 ** 3
    );
    expect(meta.resolution).toBe('720p');
    expect(meta.encoding).toBe('WEB-DL');
    expect(meta.audio).toBe('AAC');
  });

  it('应该正确识别内封中字', () => {
    const meta = parseResourceMeta('Movie.1080p.BluRay.内封中字.mkv', 10 * 1024 ** 3);
    expect(meta.subtitle).toBe('内封中字');
  });

  it('应该正确识别外挂中字', () => {
    const meta = parseResourceMeta('Movie.1080p.BluRay.中英字幕.mkv', 10 * 1024 ** 3);
    expect(meta.subtitle).toBe('外挂中字');
  });

  it('未知信息应返回 unknown', () => {
    const meta = parseResourceMeta('random_file.mp4', 500 * 1024 ** 2);
    expect(meta.resolution).toBe('unknown');
    expect(meta.encoding).toBe('unknown');
    expect(meta.audio).toBe('unknown');
    expect(meta.subtitle).toBe('none');
  });
});

describe('scoreResource', () => {
  it('4K Remux Atmos 应该得到高分', () => {
    const meta = parseResourceMeta(
      'Movie.2160p.Remux.Atmos.mkv',
      80 * 1024 ** 3
    );
    const score = scoreResource(meta);
    expect(score).toBeGreaterThanOrEqual(90); // 40+30+15+10 = 95
  });

  it('1080p BluRay DTS 应该得到中等偏上分数', () => {
    const meta = parseResourceMeta(
      'Movie.1080p.BluRay.DTS.mkv',
      15 * 1024 ** 3
    );
    const score = scoreResource(meta);
    expect(score).toBeGreaterThanOrEqual(60); // 30+25+10+10 = 75
  });

  it('720p WEB-DL AAC 应该得到中等分数', () => {
    const meta = parseResourceMeta(
      'Movie.720p.WEB-DL.AAC.mp4',
      2 * 1024 ** 3
    );
    const score = scoreResource(meta);
    expect(score).toBeGreaterThanOrEqual(25); // 10+15+5 = 30
  });

  it('过小文件应该扣分', () => {
    const meta = parseResourceMeta('Movie.480p.mp4', 100 * 1024 ** 2); // 100MB
    const score = scoreResource(meta);
    expect(score).toBeLessThan(0); // -10 大小扣分
  });
});

describe('rankResources', () => {
  const resources: QuarkResource[] = [
    { title: 'Movie.720p.WEB-DL.AAC.mp4', size: 2 * 1024 ** 3, shareUrl: 'http://a', fid: '1' },
    { title: 'Movie.2160p.Remux.Atmos.mkv', size: 80 * 1024 ** 3, shareUrl: 'http://b', fid: '2' },
    { title: 'Movie.1080p.BluRay.DTS.mkv', size: 15 * 1024 ** 3, shareUrl: 'http://c', fid: '3' },
  ];

  it('应该按分数降序排列', () => {
    const ranked = rankResources(resources);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].meta.resolution).toBe('4K');
    expect(ranked[1].meta.resolution).toBe('1080p');
    expect(ranked[2].meta.resolution).toBe('720p');
  });

  it('应该过滤低于阈值的资源', () => {
    const ranked = rankResources(resources, 50);
    expect(ranked.length).toBeLessThan(3);
    expect(ranked.every(r => r.score >= 50)).toBe(true);
  });
});

describe('applyPreferenceBonus', () => {
  it('应该为匹配偏好关键词的资源加分', () => {
    const resources: QuarkResource[] = [
      { title: 'Movie.1080p.WEB-DL.AAC.mp4', size: 5 * 1024 ** 3, shareUrl: 'http://a', fid: '1' },
      { title: 'Movie.1080p.BluRay.DTS.mkv', size: 15 * 1024 ** 3, shareUrl: 'http://b', fid: '2' },
    ];
    const ranked = rankResources(resources);
    const withBonus = applyPreferenceBonus(ranked, 'BluRay,Remux');

    // BluRay 资源应该因为偏好加分而排到前面
    expect(withBonus[0].resource.fid).toBe('2');
  });

  it('空偏好不应影响排序', () => {
    const resources: QuarkResource[] = [
      { title: 'Movie.1080p.WEB-DL.mp4', size: 5 * 1024 ** 3, shareUrl: 'http://a', fid: '1' },
      { title: 'Movie.2160p.Remux.mkv', size: 80 * 1024 ** 3, shareUrl: 'http://b', fid: '2' },
    ];
    const ranked = rankResources(resources);
    const withBonus = applyPreferenceBonus(ranked, '');

    expect(withBonus[0].resource.fid).toBe(ranked[0].resource.fid);
  });
});
