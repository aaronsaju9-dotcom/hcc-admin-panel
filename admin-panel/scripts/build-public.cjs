const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const source = fs.existsSync(path.join(root, 'server.js')) ? root : path.join(root, 'admin-panel');
const output = path.join(root, 'public');
// Publish an explicit allowlist, never the repository, admin shell or stored data.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
const files = ['site.html', 'base.css', 'redesign.css', 'site.js', 'scroll-design.js',
  'logo.webp', 'hero-bg-cricket.webp', 'gallery-local-1.webp', 'gallery-local-2.webp'];
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(output, file));
fs.copyFileSync(path.join(source, 'site.html'), path.join(output, 'index.html'));
for (const file of ['ball-scroll.mp4', 'ball-poster.jpg', 'batter.png'])
  fs.copyFileSync(path.join(source, 'assets', file), path.join(output, 'assets', file));
console.log('Built the public website; private backend/admin files excluded.');
