/**
 * Matcher -- 标题匹配器
 *
 * 判断搜索结果是否与目标影视匹配
 * 处理: 中英文差异、特殊字符、剧集编号等
 */

// ======================== 字符串相似度 ========================

/**
 * 计算两个字符串的相似度 (0-1)
 * 使用 token 匹配策略, 对中英文混合标题友好
 */
function similarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[\s.\-_()[\]【】（）]+/g, ' ')
      .replace(/[^\w\s一-鿿]/g, '')
      .trim();

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // token 匹配 (按空格和中文字符分词)
  const tokenize = (s: string): Set<string> => {
    const tokens = new Set<string>();
    // 英文单词
    for (const word of s.split(/\s+/)) {
      if (word) tokens.add(word);
    }
    // 中文字符作为单字 token
    for (const char of s) {
      if (/[一-鿿]/.test(char)) {
        tokens.add(char);
      }
    }
    return tokens;
  };

  const tokensA = tokenize(na);
  const tokensB = tokenize(nb);
  const intersection = [...tokensA].filter(t => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);

  return union.size > 0 ? intersection.length / union.size : 0;
}

// ======================== 匹配判断 ========================

/**
 * 检查资源标题是否匹配目标影视
 *
 * @param targetTitle 目标影视标题 (如 "盗梦空间")
 * @param targetYear 目标年份 (如 2010)
 * @param resourceTitle 搜索到的资源标题
 * @param threshold 匹配阈值 (默认 0.4)
 * @returns 是否匹配
 */
export function isMatch(
  targetTitle: string,
  targetYear: number | null,
  resourceTitle: string,
  threshold: number = 0.4,
): boolean {
  const sim = similarity(targetTitle, resourceTitle);

  // 标题相似度足够高 → 直接通过
  if (sim >= threshold) return true;

  // 标题相似度不够, 但如果年份匹配且标题包含关键子串 → 也通过
  if (targetYear) {
    const yearStr = String(targetYear);
    const hasYear = resourceTitle.includes(yearStr);
    if (hasYear && sim >= threshold * 0.6) return true;
  }

  return false;
}

/**
 * 从匹配的资源中过滤出最相关的
 */
export function filterMatches<T extends { title: string }>(
  targetTitle: string,
  targetYear: number | null,
  resources: T[],
): T[] {
  return resources.filter(r => isMatch(targetTitle, targetYear, r.title));
}
