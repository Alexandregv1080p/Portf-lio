import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const src = 'public/tex';
for (const size of [512, 256]) {
  const out = path.join(src, String(size)); fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.jpg'))) {
    await sharp(path.join(src, f)).resize(size, size, { fit: 'fill' }).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(out, f));
  }
  console.log(size, fs.readdirSync(out).length, 'arquivos');
}
