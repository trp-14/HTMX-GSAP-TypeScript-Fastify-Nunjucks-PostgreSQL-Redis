/**
 * A deliberately small Markdown renderer for Knowledge Center articles. It escapes *all* HTML
 * first and then adds a fixed set of tags, so article content can never inject markup or script.
 * Supported: ## / ### headings, paragraphs, - and 1. lists, > blockquotes, > [!NOTE]/[!WARNING]
 * callouts, ``` code blocks, `code`, **bold**, *italic*, [links](/internal or https://…), tables.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safe = /^(\/[^/]|https:\/\/)/.test(href) ? href : '#';
    const external = safe.startsWith('https://');
    return `<a href="${safe}"${external ? ' rel="noopener noreferrer" target="_blank"' : ''}>${label}</a>`;
  });
  return s;
}

export type Heading = { id: string; text: string; level: number };

export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  let i = 0;
  let sectionOpen = false;

  const closeSection = () => {
    if (sectionOpen) out.push('</section>');
    sectionOpen = false;
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      const id = slugify(text);
      headings.push({ id, text, level });
      if (level === 2) {
        closeSection();
        out.push('<section class="md-section" data-reveal>');
        sectionOpen = true;
      }
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) quote.push(lines[i++]!.replace(/^>\s?/, ''));
      const callout = /^\[!(NOTE|TIP|WARNING)\]\s*/.exec(quote[0] ?? '');
      if (callout) {
        quote[0] = quote[0]!.slice(callout[0].length);
        const kind = callout[1]!.toLowerCase();
        out.push(
          `<aside class="callout callout-${kind}"><strong class="callout-label">${callout[1]}</strong><p>${inline(quote.join(' ').trim())}</p></aside>`,
        );
      } else {
        out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      }
      continue;
    }
    if (/^\|.+\|$/.test(line.trim())) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i]!.trim())) {
        const cells = lines[i++]!.trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      out.push(
        `<div class="table-wrap"><table class="md-table"><thead><tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (/^(-|\d+\.)\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(-|\d+\.)\s+/.test(lines[i]!))
        items.push(lines[i++]!.replace(/^(-|\d+\.)\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,3}\s|```|>|-\s|\d+\.\s|\|)/.test(lines[i]!))
      para.push(lines[i++]!);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeSection();
  return { html: out.join('\n'), headings };
}

/** Turns a ts_headline snippet ([[match]]) into safe HTML with <mark>. */
export function highlightSnippet(snippet: string): string {
  return escapeHtml(snippet.replace(/[#*`>|]/g, ' ').replace(/\s+/g, ' '))
    .replace(/\[\[/g, '<mark>')
    .replace(/\]\]/g, '</mark>');
}
