import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, matchSlash, substituteVars } from "./markdown.js";

// Seguranca (trust boundary: notas escritas pela equipe, lidas pela equipe).
test("renderMarkdown neutraliza HTML", () => {
  assert.ok(!renderMarkdown("<script>alert(1)</script>").includes("<script>"));
  assert.ok(renderMarkdown("<b>x</b>").includes("&lt;b&gt;"));
});

test("renderMarkdown so aceita link http(s)/mailto", () => {
  assert.ok(!/<a /.test(renderMarkdown("[x](javascript:alert(1))")));
  // aspas no url viram &quot; e nao quebram o atributo href
  const ev = renderMarkdown('[x](http://evil"onmouseover=alert(1))');
  assert.ok(!ev.includes('"onmouseover'));
  assert.ok(/<a href="http:\/\/x" target="_blank" rel="noopener noreferrer"/.test(renderMarkdown("[t](http://x)")));
});

test("renderMarkdown formata negrito/italico/code/listas", () => {
  assert.equal(renderMarkdown("**a**"), "<strong>a</strong>");
  assert.equal(renderMarkdown("um *it* dois"), "um <em>it</em> dois");
  assert.equal(renderMarkdown("`cod`"), "<code>cod</code>");
  assert.equal(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
});

test("matchSlash detecta /atalho no fim do texto", () => {
  assert.deepEqual(matchSlash("/age"), { query: "age", start: 0 });
  assert.deepEqual(matchSlash("oi /ret"), { query: "ret", start: 3 });
  assert.deepEqual(matchSlash("/"), { query: "", start: 0 });
  assert.equal(matchSlash("http://x"), null);
  assert.equal(matchSlash("a/b"), null);
  assert.equal(matchSlash("sem barra"), null);
});

test("substituteVars troca {{nome}} e {{primeiro_nome}}", () => {
  assert.equal(substituteVars("Oi {{nome}}!", "Ana Paula Souza"), "Oi Ana Paula Souza!");
  assert.equal(substituteVars("Oi {{ primeiro_nome }}", "Ana Paula Souza"), "Oi Ana");
  assert.equal(substituteVars("Oi {{NOME}}", ""), "Oi ");
});
