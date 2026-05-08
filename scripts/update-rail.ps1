# Atualiza o menu lateral (.aura-rail__nav) em todas as paginas HTML para a nova ordem unificada.
# IMPORTANTE: este script e' ASCII puro. O conteudo do nav vem do arquivo _rail-nav.html
# (UTF-8 sem BOM) para evitar problemas de encoding com PowerShell 5.1 (Windows).

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$navTemplatePath = Join-Path $PSScriptRoot "_rail-nav.html"

if (-not (Test-Path $navTemplatePath)) {
  Write-Host "[erro] template nao encontrado:" $navTemplatePath
  exit 1
}

# Le o template como bytes UTF-8 (preserva acentos sem qualquer conversao).
$navBytes = [System.IO.File]::ReadAllBytes($navTemplatePath)
$navContent = [System.Text.Encoding]::UTF8.GetString($navBytes)

$files = @(
  "index.html",
  "agenda.html",
  "admin.html",
  "community.html",
  "diario-evolucao.html",
  "especialista-agenda.html",
  "especialistas.html",
  "explorar.html",
  "indicados.html",
  "mensagens.html",
  "perfil.html",
  "perfil-usuario.html",
  "reembolsos.html",
  "scanner.html"
)

# Regex multiline para casar do <nav class="aura-rail__nav"> ate o </nav> seguinte (nao-greedy).
$pattern = '(?s)<nav class="aura-rail__nav">.*?</nav>'

$updated = 0
$skipped = 0

foreach ($name in $files) {
  $path = Join-Path $root $name
  if (-not (Test-Path $path)) {
    Write-Host "[skip]" $name "(nao encontrado)"
    $skipped++
    continue
  }

  # Le como UTF-8 puro via .NET (preserva acentos do arquivo original).
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $content = [System.Text.Encoding]::UTF8.GetString($bytes)

  if ($content -notmatch '<nav class="aura-rail__nav">') {
    Write-Host "[skip]" $name "(sem aura-rail__nav)"
    $skipped++
    continue
  }

  $new = [regex]::Replace(
    $content,
    $pattern,
    [System.Text.RegularExpressions.MatchEvaluator]{ param($m) return $navContent }
  )

  if ($new -eq $content) {
    Write-Host "[noop]" $name
    continue
  }

  # Salva como UTF-8 sem BOM diretamente via .NET (sem passar pelo encoding default do PS).
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $newBytes = $utf8NoBom.GetBytes($new)
  [System.IO.File]::WriteAllBytes($path, $newBytes)

  Write-Host "[ok]  " $name
  $updated++
}

Write-Host ""
Write-Host "Concluido: $updated atualizados, $skipped pulados."
