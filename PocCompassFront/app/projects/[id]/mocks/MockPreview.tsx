"use client";

/**
 * Shows AI-written HTML without letting it reach anything (SPEC §18.1):
 * - sandbox="allow-scripts" without allow-same-origin → opaque origin, no cookies / storage / parent access
 * - CSP default-src 'none' → no network at all; only inline style / script and data: images
 */
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'";
const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

export function withCsp(source: string): string {
  // CSP does not stop a meta refresh from navigating the frame away; drop it.
  const html = source.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*>/gi, "");
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + META + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return doctype[0] + `<head>${META}</head>` + html.slice(doctype[0].length);
  return `<head>${META}</head>` + html;
}

export default function MockPreview({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      srcDoc={withCsp(html)}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="h-full w-full rounded-xl border border-slate-200 bg-white"
    />
  );
}
