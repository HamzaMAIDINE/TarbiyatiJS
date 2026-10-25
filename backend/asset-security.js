'use strict';

// A conservative build-time guard for our authored SVG assets, not a sanitizer
// or an upload parser. SVG responses also receive a sandboxed CSP at runtime.
function validateSvg(source, name = 'SVG') {
  const reject = () => { throw new Error(`Unsafe SVG asset: ${name}`); };
  if (Buffer.byteLength(source) > 2 * 1024 * 1024 ||
      /<!\s*(?:DOCTYPE|ENTITY)|<\?xml-stylesheet|<\s*(?:[\w-]+:)?(?:script|foreignObject|iframe|object|embed|audio|video|animate\w*|set)\b|\s(?:[\w-]+:)?on[\w-]+\s*=/i.test(source)) reject();
  // Entities and CSS escapes can disguise protocols; only local fragments and
  // embedded PNG/JPEG pixels are needed by the project's static artwork.
  const decode = value => value.replace(/&#(x[\da-f]+|\d+);?/gi, (_, code) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/&colon;/gi, ':').replace(/\\([\da-f]{1,6})\s?/gi, (_, code) => {
    const point = parseInt(code, 16); return point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/\\(.)/g, '$1');
  for (const match of source.matchAll(/\b(?:[\w-]+:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = decode(match[1] ?? match[2] ?? match[3]).trim();
    if (!/^#[\w.-]+$/.test(value) && !/^data:image\/(?:png|jpeg);base64,[a-z\d+/=\s]+$/i.test(value)) reject();
  }
  const decoded = decode(source);
  if (/@import|expression\s*\(/i.test(decoded)) reject();
  for (const match of decoded.matchAll(/url\s*\(([^)]*)\)/gi)) {
    if (!/^["']?#[\w.-]+["']?$/.test(match[1].trim())) reject();
  }
}

module.exports = { validateSvg };
