# Gera fala sintética local em português para o teste opcional no Windows.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureDirectory = Join-Path $projectRoot '.cache/test-data'
New-Item -ItemType Directory -Force -Path $fixtureDirectory | Out-Null
$voice = New-Object -ComObject SAPI.SpVoice
$audio = New-Object -ComObject SAPI.SpFileStream
try {
    $audio.Open((Join-Path $fixtureDirectory 'speech.wav'), 3)
    $voice.AudioOutputStream = $audio
    $voice.Speak('Olá. Este é um teste de transcrição de áudio local. O aplicativo transforma a fala em texto.') | Out-Null
} finally {
    $audio.Close()
}

& (Join-Path $projectRoot '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'extend-fixture.py')
