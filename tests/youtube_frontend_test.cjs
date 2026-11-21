// Component/data-contract checks, not browser interaction or playback tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../web');
const webRequire = createRequire(path.join(root, 'package.json'));
const ts = webRequire('typescript');
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const cache = new Map();
let response = {};
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  let source = fs.readFileSync(file, 'utf8');
  // Expose only within the test VM; keep the production module API unchanged.
  if (file.endsWith('Result.tsx')) source += '\nexport { ResultBody };';
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const resolve = (name) => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return webRequire(name);
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
    const target = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
    if (!target) throw Error('Unknown source module ' + name);
    return load(target);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: resolve,
    process: { env: {} }, URL, TextEncoder, btoa, AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ text: async () => JSON.stringify(response) }),
  }, { filename: file });
  return module.exports;
}

(async () => {
  const parse = load(path.join(root, 'lib/parse.ts'));
  for (const [seconds, expected] of [[16012, '4:26:52'], [3600, '1:00:00'], [3599.6, '1:00:00'], [44, '0:44'], [null, ''], [Infinity, '']]) {
    assert.equal(parse.formatDuration(seconds), expected);
  }
  const { I18nProvider } = load(path.join(root, 'lib/i18n.tsx'));
  const { ResultBody } = load(path.join(root, 'components/Result.tsx'));
  const media = 'https://rr1.googlevideo.com/video';
  const audio = 'https://rr1.googlevideo.com/audio';
  const raw = { type: 'video', title: 'Long video', duration: 16012, quality: '1080P',
    url: null, requires_merge: true, video_url: media, audio_url: audio };
  const render = data => renderToStaticMarkup(React.createElement(I18nProvider, null,
    React.createElement(ResultBody, { result: { platform: 'youtube', source: 'https://youtu.be/rfscVS0vtbw', data: parse.normalize(data) } })));
  const split = render(raw);
  for (const value of ['视频（无声）', '音频', '分别下载', '4:26:52', 'href="' + media + '"', 'href="' + audio + '"']) {
    assert.ok(split.includes(value), value);
  }
  const complete = render({ ...raw, url: media, requires_merge: false, audio_url: null });
  assert.ok(complete.includes('src="' + media + '"'));
  assert.ok(!complete.includes('视频（无声）'));
  response = { code: 200, data: raw };
  for (const url of ['https://youtu.be/rfscVS0vtbw', 'https://www.youtube.com/watch?v=rfscVS0vtbw', 'https://www.youtube.com/shorts/1iOz67cPc54']) {
    const result = await parse.parseShare(url);
    assert.equal(result.platform, 'youtube');
    assert.equal(result.data.audio_url, audio);
    assert.equal(result.data.url, null);
  }
  response = { code: 422, msg: 'YouTube 要求额外验证' };
  await assert.rejects(parse.parseShare('https://youtu.be/rfscVS0vtbw'), e => e.code === 'server' && e.detail === response.msg);
  console.log('PASS: duration, complete/split result markup, download links, YouTube URL forms, upstream error propagation');
})().catch(error => { console.error(error); process.exitCode = 1; });
