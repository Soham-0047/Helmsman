"use client";
// Tiny GitHub-flavored markdown renderer: paragraphs, inline code, bold,
// @mentions, #issue refs, and fenced code blocks with +/- and comment coloring.

function mdToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])@([a-z0-9_-]+)/gi, '$1<span class="md-mention">@$2</span>')
      .replace(/(#\d+)/g, '<span class="md-issue">$1</span>');
  const out: string[] = [];
  const parts = src.split(/```/);
  parts.forEach((chunk, i) => {
    if (i % 2 === 1) {
      const lines = chunk.replace(/^\n/, "").split("\n");
      let lang = "";
      if (lines[0] && !lines[0].includes(" ") && lines[0].length < 12) lang = lines.shift() as string;
      const code = lines.join("\n").replace(/\n$/, "");
      const colored = esc(code)
        .replace(/^([+].*)$/gm, '<span class="md-add">$1</span>')
        .replace(/^([-].*)$/gm, '<span class="md-del">$1</span>')
        .replace(/(\/\/.*)$/gm, '<span class="md-cmt">$1</span>');
      out.push(`<pre class="md-pre"><div class="md-lang">${lang || "code"}</div><code>${colored}</code></pre>`);
    } else {
      chunk.split(/\n{2,}/).forEach((para) => {
        const p = para.trim();
        if (!p) return;
        out.push(`<p>${inline(p).replace(/\n/g, "<br/>")}</p>`);
      });
    }
  });
  return out.join("");
}

export function MarkdownPreview({ source }: { source: string }) {
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(source || "") }} />;
}

export { mdToHtml };
