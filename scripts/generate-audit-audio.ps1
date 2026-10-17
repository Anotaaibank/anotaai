$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$anotaAudioRoot=Join-Path (Get-Location) 'tests/fixtures/audio-audit'
New-Item -ItemType Directory -Path $anotaAudioRoot -Force|Out-Null
$anotaFixture=Get-Content tests/fixtures/command-audit.json -Raw -Encoding UTF8|ConvertFrom-Json
$anotaSpeech=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 $anotaSpeech.SelectVoice('Microsoft Maria Desktop')
 foreach($anotaCase in $anotaFixture.cases|Where-Object {$_.id -in @('saldo-01','renda-01','gasto-01','moto-01','agenda-01','renda-04','agenda-05','saldo-05')}){
  $anotaSpeech.SetOutputToWaveFile((Join-Path $anotaAudioRoot ($anotaCase.id+'.wav')))
  $anotaSpeech.Speak($anotaCase.text)
  Write-Output ('Áudio sintético gerado: '+$anotaCase.id)
 }
} finally {$anotaSpeech.Dispose()}
