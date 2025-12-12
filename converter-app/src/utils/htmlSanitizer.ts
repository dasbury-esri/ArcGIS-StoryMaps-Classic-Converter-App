// Basic HTML sanitizer shared across converters.
// Allows only <strong>, <em>, and <a href> tags; strips inline styles and disallowed tags.
// Collects inline style strings for optional surfacing via converter metadata.

export type SanitizedHtmlResult = { sanitizedHtml: string; inlineStyles: string[] };

export function sanitizeBasicHtml(html: string): SanitizedHtmlResult {
  let working = html || '';
  const styles: string[] = [];
  // Collect inline style attributes
  working = working.replace(/style\s*=\s*"([^"]*)"/gi, (_m, s) => { styles.push(String(s)); return ''; });
  working = working.replace(/style\s*=\s*'([^']*)'/gi, (_m, s) => { styles.push(String(s)); return ''; });
  // Remove script/style tags entirely
  working = working.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
                   .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  // Normalize b/i to strong/em
  working = working.replace(/<\s*b\s*>/gi, '<strong>')
                   .replace(/<\s*\/\s*b\s*>/gi, '</strong>')
                   .replace(/<\s*i\s*>/gi, '<em>')
                   .replace(/<\s*\/\s*i\s*>/gi, '</em>');
  // Process anchor tags: keep href, strip other attrs
  working = working.replace(/<\s*a\s+([^>]+)>/gi, (_m, attrs) => {
    const hrefMatch = /href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(attrs || '');
    const href = hrefMatch ? hrefMatch[1].replace(/^['"]|['"]$/g, '') : '';
    if (href) return `<a href="${href}">`;
    else return '<a>';
  });
  // Strip all attributes from allowed tags
  working = working.replace(/<\s*(strong|em|a)\s+[^>]*>/gi, (_m, tag) => `<${String(tag).toLowerCase()}>`);
  // Remove disallowed tags but retain inner text
  working = working.replace(/<\s*(?!strong\b|em\b|a\b)\/?\s*([a-z0-9-]+)([^>]*)>/gi, (m) => {
    // Replace opening and closing tags with empty to keep inner text
    return '';
  });
  // Replace non-breaking spaces with normal spaces
  working = working.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
  // Collapse multiple consecutive newlines to a single newline
  working = working.replace(/(?:\r?\n|\r){2,}/g, '\n');
  return { sanitizedHtml: working, inlineStyles: styles };
}
