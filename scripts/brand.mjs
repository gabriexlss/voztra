/** Converte a arte original em tamanhos de distribuição, sem alterar seu desenho. */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
await mkdir('src/renderer/src/assets/brand', { recursive: true })
const input = 'assets/brand/voztra-original.png'
for (const [path, size] of [
  ['build/icon.png', 512],
  ['src/renderer/src/assets/brand/icon.png', 128]
]) {
  await sharp(input).resize(size, size).png().toFile(path)
}
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(
  sizes.map((size) => sharp(input).resize(size, size).png().toBuffer())
)
const header = Buffer.alloc(6 + images.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
images.forEach((data, i) => {
  const entry = 6 + i * 16
  header[entry] = header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(data.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += data.length
})
await writeFile('build/icon.ico', Buffer.concat([header, ...images]))
