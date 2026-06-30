// Helpers puros de notas/respostas rápidas. Fonte única para browser e testes.
// No browser é carregado via ponte <script type="module"> no index.html (expõe no window);
// no node é importado direto por markdown.test.js. Por isso tem escapeHtml próprio.

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Markdown minimo e seguro p/ notas internas. Escapa ANTES de formatar (trust boundary).
// ponytail: cobre negrito/italico/code/links/listas; sem tabelas/headings/imagens, add when pedirem.
export function renderMarkdown(text) {
  let html = escapeHtml(String(text || ""));
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  let out = "", inList = false;
  for (const line of html.split("\n")) {
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${item[1]}</li>`; }
    else { if (inList) { out += "</ul>"; inList = false; } out += `${line}<br>`; }
  }
  if (inList) out += "</ul>";
  return out.replace(/<br>$/, "");
}

// Puro: detecta um token "/query" no fim do texto antes do cursor.
export function matchSlash(before) {
  const m = before.match(/(?:^|\s)\/(\S*)$/);
  if (!m) return null;
  return { query: m[1], start: before.length - m[1].length - 1 };
}

// Puro: troca {{nome}} e {{primeiro_nome}}.
export function substituteVars(text, name) {
  const full = name || "";
  const first = full.split(/\s+/)[0] || full;
  return String(text)
    .replace(/\{\{\s*nome\s*\}\}/gi, full)
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, first);
}
