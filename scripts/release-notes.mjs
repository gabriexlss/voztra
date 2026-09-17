/** Uma fonte única alimenta as notas do app, o changelog e os textos publicados. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const releases = JSON.parse(readFileSync('src/shared/releases.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (releases[0].version !== pkg.version) throw new Error('Versão do changelog divergente.')
mkdirSync('.cache/release-notes', { recursive: true })
let changelog =
  '# Histórico de versões\n\nAs datas originais das versões legadas não foram confirmadas.\n\n'
for (const release of releases) {
  const body = `## ${release.version} — ${release.title}\n\n${release.changes.map((c) => `- ${c}`).join('\n')}\n`
  const legacy =
    release.version !== pkg.version
      ? '\nPublicação de preservação: instalador original do Transcrevedor. O código-fonte correspondente exato não foi preservado em commits históricos. A tag identifica o registro de arquivo e não uma reconstrução do código desta versão. Atualize manualmente para o Voztra 1.3 ou posterior para receber novas atualizações.\n'
      : '\nWindows x64: escolha **setup.exe** para instalar e receber atualizações, ou **portable.exe** para executar sem instalação. No portable, preserve a pasta `data` ao substituir o executável. Modelos Whisper são baixados separadamente. Binários sem assinatura comercial.\n'
  writeFileSync(`.cache/release-notes/${release.version}.md`, body + legacy)
  changelog += body + '\n'
}
writeFileSync('CHANGELOG.md', changelog)
