import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import parseSrcset from 'parse-srcset';
import { assetUrl, bundle, isExternal, localPath } from './bundle.js';

const attrEscape = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const scriptTag = (js) => `<tonk-component><script type="tonk/module">\n${js}</script></tonk-component>`;
const styleTag = (css, media) => `<style${media ? ` media="${attrEscape(media)}"` : ''}>\n${css}</style>`;

function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
  if (node.content) yield* walk(node.content);
}

export async function compileHtml(file, config, files) {
  files.add(file);
  const source = await readFile(file, 'utf8');
  const edits = [];
  const warnings = [];
  let scriptCount = 0;
  for (const node of walk(parse(source, { sourceCodeLocationInfo: true }))) {
    const loc = node.sourceCodeLocation;
    if (!loc || !node.tagName) continue;
    const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]));
    const replace = (text) => edits.push({ start: loc.startOffset, end: loc.endOffset, text });
    if (node.tagName === 'script') {
      const type = (attrs.type ?? '').toLowerCase();
      if (!['', 'module', 'text/javascript', 'application/javascript', 'tonk/module'].includes(type)) continue;
      if (++scriptCount > 1) throw new Error(`${file}: use one script entry and import other modules from it.`);
      if ('async' in attrs || 'nomodule' in attrs) throw new Error(`${file}: async/nomodule scripts are unsupported. Use a single type="module" entry.`);
      if (attrs.src && isExternal(attrs.src)) throw new Error(`${file}: script src must be a local entry; import dependencies from that module.`);
      if (!loc.endTag) throw new Error(`${file}: script requires a closing </script>.`);
      const input = attrs.src
        ? { entryPoints: [localPath(attrs.src, file, config.root)] }
        : { stdin: { contents: source.slice(loc.startTag.endOffset, loc.endTag.startOffset), resolveDir: path.dirname(file), sourcefile: file + '.js', loader: 'js' } };
      const compiled = await bundle(config, files, input);
      warnings.push(...compiled.warnings);
      replace((compiled.css ? styleTag(compiled.css) : '') + scriptTag(compiled.js));
      continue;
    }
    if (node.tagName === 'style' || (node.tagName === 'link' && (attrs.rel ?? '').toLowerCase().split(/\s+/).includes('stylesheet'))) {
      if (node.tagName === 'link' && (!attrs.href || isExternal(attrs.href))) continue;
      if ('disabled' in attrs || (attrs.rel ?? '').includes('alternate')) throw new Error(`${file}: disabled/alternate stylesheets cannot be inlined.`);
      const input = node.tagName === 'link'
        ? { entryPoints: [localPath(attrs.href, file, config.root)] }
        : { stdin: { contents: source.slice(loc.startTag.endOffset, loc.endTag?.startOffset ?? loc.endOffset), resolveDir: path.dirname(file), sourcefile: file + '.css', loader: 'css' } };
      const compiled = await bundle(config, files, input, 'css');
      warnings.push(...compiled.warnings);
      replace(styleTag(compiled.css, attrs.media));
      continue;
    }
    const assetAttrs = [];
    if (['img', 'source', 'video', 'audio', 'track', 'input'].includes(node.tagName)) assetAttrs.push('src');
    if (node.tagName === 'video') assetAttrs.push('poster');
    if (node.tagName === 'link' && /\bicon\b/.test(attrs.rel ?? '')) assetAttrs.push('href');
    if (['image', 'use'].includes(node.tagName)) assetAttrs.push('href');
    for (const name of assetAttrs) {
      if (!attrs[name] || isExternal(attrs[name])) continue;
      const span = loc.attrs[name];
      edits.push({ start: span.startOffset, end: span.endOffset, text: `${name}="${attrEscape(await assetUrl(attrs[name], file, config, files))}"` });
    }
    if (attrs.srcset && !attrs.srcset.includes('{')) {
      const candidates = parseSrcset(attrs.srcset);
      const parts = [];
      for (const candidate of candidates) {
        const descriptor = candidate.w ? ` ${candidate.w}w` : candidate.d ? ` ${candidate.d}x` : '';
        parts.push((await assetUrl(candidate.url, file, config, files)) + descriptor);
      }
      const span = loc.attrs.srcset;
      edits.push({ start: span.startOffset, end: span.endOffset, text: `srcset="${attrEscape(parts.join(', '))}"` });
    }
  }
  // Preserve the original template text, {bindings}, html: attributes, and self-closing custom elements.
  // An HTML serializer can change their meaning.
  let html = source;
  let lastStart = source.length;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.end > lastStart) throw new Error(`${file}: overlapping HTML elements; check closing tags.`);
    html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
    lastStart = edit.start;
  }
  return { html, warnings };
}
