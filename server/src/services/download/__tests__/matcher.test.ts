import { describe, it, expect } from 'vitest';
import { isMatch, filterMatches } from '../matcher';

describe('isMatch', () => {
  it('中文标题精确匹配', () => {
    expect(isMatch('盗梦空间', 2010, '盗梦空间.Inception.2010.BluRay.1080p')).toBe(true);
  });

  it('英文标题匹配', () => {
    expect(isMatch('Inception', 2010, 'Inception.2010.1080p.BluRay')).toBe(true);
  });

  it('中英文混合匹配', () => {
    expect(isMatch('星际穿越', 2014, '星际穿越.Interstellar.2014.1080p.BluRay')).toBe(true);
  });

  it('不匹配的标题应该返回 false', () => {
    expect(isMatch('盗梦空间', 2010, '星际穿越.Interstellar.2014.1080p')).toBe(false);
  });

  it('年份辅助匹配', () => {
    expect(isMatch('盗梦', 2010, '盗梦空间2010年版')).toBe(true);
  });

  it('无年份时仅靠标题匹配', () => {
    expect(isMatch('盗梦空间', null, '盗梦空间.1080p.BluRay')).toBe(true);
  });

  it('标题完全不相关应该失败', () => {
    expect(isMatch('权力的游戏', null, 'Breaking.Bad.S01E01')).toBe(false);
  });

  it('应该忽略大小写和特殊字符', () => {
    expect(isMatch('The Matrix', 1999, 'The.Matrix.1999.1080p.BluRay')).toBe(true);
  });
});

describe('filterMatches', () => {
  const resources = [
    { title: '盗梦空间.Inception.2010.1080p.BluRay', size: 15 },
    { title: '星际穿越.Interstellar.2014.1080p.BluRay', size: 16 },
    { title: '盗梦空间2.盗梦空间2010年版', size: 10 },
    { title: '不相关的电影.Movie.2020', size: 5 },
  ];

  it('应该只返回匹配的资源', () => {
    const matched = filterMatches('盗梦空间', 2010, resources);
    expect(matched.length).toBeGreaterThanOrEqual(2);
    expect(matched.some(r => r.title.includes('Interstellar'))).toBe(false);
  });

  it('无匹配时返回空数组', () => {
    const matched = filterMatches('不存在的电影', 2025, resources);
    expect(matched).toHaveLength(0);
  });
});
