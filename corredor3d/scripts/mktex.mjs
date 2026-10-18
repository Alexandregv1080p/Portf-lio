/* gera tex/<tamanho>/*.webp a partir dos .jpg originais em assets-src/tex (ambientCG, CC0) */
import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const src = 'assets-src/tex';
for (const size of [1024, 512, 256]) {
  const out = path.join('public/tex', String(size)); fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.jpg'))) {
    await sharp(path.join(src, f)).resize(size, size, { fit: 'fill' }).webp({ quality: size >= 1024 ? 80 : 76 }).toFile(path.join(out, f.replace('.jpg', '.webp')));
  }
  console.log(size, fs.readdirSync(out).length, 'arquivos');
}
