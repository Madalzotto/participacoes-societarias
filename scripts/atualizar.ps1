<#
  Baixa os arquivos de Sócios e Empresas dos Dados Abertos do CNPJ (Receita Federal)
  e gera a API estática em site/api, que a página index.html consulta.

  Uso:
    ./scripts/atualizar.ps1 -Etapa verificar           # só verifica se há mês novo (usado pelo GitHub Actions)
    ./scripts/atualizar.ps1 -Etapa processar           # baixa o mês mais recente e gera site/
    ./scripts/atualizar.ps1 -Etapa processar -ArquivosLocais Socios0.zip,Empresas0.zip -Mes teste
#>
param(
  [ValidateSet('verificar', 'processar')] [string] $Etapa = 'processar',
  [string] $Mes,
  [switch] $Forcar,
  [string[]] $ArquivosLocais,
  [string] $Raiz = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Compartilhamento público "CNPJ" da Receita (SERPRO+), acessado por WebDAV: usuário = token, senha vazia
$Token = 'YggdBLfdninEJX9'
$Dav = 'https://arquivos.receitafederal.gov.br/public.php/webdav'
$Curl = if ($IsWindows) { 'curl.exe' } else { 'curl' }
$ArqUltima = Join-Path $Raiz 'ultima-atualizacao.json'

function Listar([string] $caminho) {
  $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Token}:"))
  $corpo = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>'
  for ($t = 1; ; $t++) {
    try {
      $r = Invoke-WebRequest -Uri "$Dav/$caminho" -CustomMethod PROPFIND -Body $corpo -ContentType 'application/xml' -TimeoutSec 180 `
        -Headers @{ Authorization = "Basic $auth"; Depth = '1' }
      break
    } catch {
      if ($t -ge 5) { throw "Não foi possível listar '$caminho' na Receita: $($_.Exception.Message)" }
      Write-Host "  falha ao listar '$caminho' ($($_.Exception.Message)); nova tentativa em $(30 * $t)s"
      Start-Sleep -Seconds (30 * $t)
    }
  }
  $xml = [xml] $r.Content
  $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable); $ns.AddNamespace('d', 'DAV:')
  foreach ($resp in $xml.SelectNodes('//d:response', $ns)) {
    $href = [uri]::UnescapeDataString($resp.SelectSingleNode('d:href', $ns).InnerText)
    $tam = $resp.SelectSingleNode('.//d:getcontentlength', $ns)
    [pscustomobject]@{
      Nome    = ($href.TrimEnd('/') -split '/')[-1]
      Pasta   = $href.EndsWith('/')
      Tamanho = if ($tam -and $tam.InnerText) { [long] $tam.InnerText } else { 0L }
    }
  }
}

function MesMaisRecente {
  $m = Listar '' | Where-Object { $_.Pasta -and $_.Nome -match '^\d{4}-\d{2}$' } | Sort-Object Nome | Select-Object -Last 1
  if (-not $m) { throw 'Nenhuma pasta AAAA-MM encontrada no compartilhamento da Receita.' }
  $m.Nome
}

function ArquivosDoMes([string] $mes) {
  Listar "$mes/" | Where-Object { -not $_.Pasta -and $_.Nome -match '^(Socios|Empresas)\d\.zip$' }
}

function Saida([string] $nome, [string] $valor) {
  Write-Host "$nome=$valor"
  if ($env:GITHUB_OUTPUT) { "$nome=$valor" | Add-Content -Path $env:GITHUB_OUTPUT }
}

if ($Etapa -eq 'verificar') {
  $mes = if ($Mes) { $Mes } else { MesMaisRecente }
  $ultimo = if (Test-Path $ArqUltima) { (Get-Content $ArqUltima -Raw | ConvertFrom-Json).mes } else { '' }
  $arqs = @(ArquivosDoMes $mes)
  $completo = @($arqs | Where-Object Nome -like 'Socios*').Count -eq 10 -and @($arqs | Where-Object Nome -like 'Empresas*').Count -eq 10
  $forcar = $Forcar -or $env:FORCAR -eq 'true'
  Write-Host "Mês mais recente na Receita: $mes ($($arqs.Count)/20 arquivos de Sócios+Empresas) · último publicado: $(if ($ultimo) { $ultimo } else { 'nenhum' })"
  if (-not $completo) { Write-Host 'A pasta do mês ainda não está completa; tento de novo amanhã.' }
  Saida 'mes' $mes
  Saida 'novo' ($completo -and ($forcar -or $mes -ne $ultimo)).ToString().ToLower()
  return
}

# ---------------- processar ----------------
$trab = Join-Path $Raiz 'trabalho'
New-Item -ItemType Directory -Force -Path $trab | Out-Null
if ($ArquivosLocais) {
  $arquivos = $ArquivosLocais | ForEach-Object { (Resolve-Path $_).Path }
  if (-not $Mes) { $Mes = 'local' }
} else {
  if (-not $Mes) { $Mes = MesMaisRecente }
  $lista = @(ArquivosDoMes $Mes)
  if (@($lista | Where-Object Nome -like 'Socios*').Count -ne 10) { throw "A pasta $Mes não tem os 10 arquivos de Sócios." }
  $totalMB = [math]::Round(($lista | Measure-Object Tamanho -Sum).Sum / 1MB)
  Write-Host "Baixando $($lista.Count) arquivos de $Mes ($totalMB MB)…"
  $arquivos = foreach ($a in $lista | Sort-Object Nome) {
    $dest = Join-Path $trab $a.Nome
    if ((Test-Path $dest) -and (Get-Item $dest).Length -eq $a.Tamanho) { $dest; continue }
    $ini = Get-Date
    for ($t = 1; ; $t++) {
      & $Curl -fsSL --retry 5 --retry-delay 20 --connect-timeout 60 -u "${Token}:" -o $dest "$Dav/$Mes/$($a.Nome)"
      if ($LASTEXITCODE -eq 0 -and (Get-Item $dest).Length -eq $a.Tamanho) { break }
      Remove-Item $dest -ErrorAction SilentlyContinue
      if ($t -ge 4) { throw "Falha ao baixar $($a.Nome) (curl $LASTEXITCODE)." }
      Write-Host "  falha ao baixar $($a.Nome); nova tentativa em $(60 * $t)s"
      Start-Sleep -Seconds (60 * $t)
    }
    $seg = [math]::Max(1, ((Get-Date) - $ini).TotalSeconds)
    Write-Host ('  {0,-15} {1,6:N0} MB em {2,4:N0}s ({3:N1} MB/s)' -f $a.Nome, ($a.Tamanho / 1MB), $seg, ($a.Tamanho / 1MB / $seg))
    $dest
  }
}
$socios = @($arquivos | Where-Object { (Split-Path $_ -Leaf) -match 'socio' })
$empresas = @($arquivos | Where-Object { (Split-Path $_ -Leaf) -match 'empre' })
if (-not $socios) { throw 'Nenhum arquivo de Sócios informado.' }

Add-Type -Path (Join-Path $PSScriptRoot 'IndexadorCnpj.cs') -ReferencedAssemblies @(
  'System.Collections', 'System.Console', 'System.IO.Compression', 'System.IO.Compression.ZipFile', 'System.Linq',
  'System.Runtime', 'System.Text.Encoding.Extensions', 'System.Text.Encodings.Web', 'System.Text.Json', 'System.Memory',
  'System.Runtime.Extensions', 'System.Globalization')

$site = Join-Path $Raiz 'site'
if (Test-Path $site) { Remove-Item $site -Recurse -Force }
$resumo = [IndexadorCnpj]::Executar([string[]] $socios, [string[]] $empresas, (Join-Path $site 'api'), $Mes)
$mb = [math]::Round((Get-ChildItem $site -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "Tamanho da API: $mb MB"
if ($mb -gt 950) { throw "A API ficou com $mb MB, acima do limite de 1 GB do GitHub Pages." }
Copy-Item (Join-Path $Raiz 'index.html') (Join-Path $site 'index.html')
New-Item -ItemType File -Path (Join-Path $site '.nojekyll') -Force | Out-Null
# só a execução com os arquivos oficiais registra o mês publicado (testes com arquivos locais não)
if (-not $ArquivosLocais) {
  [ordered]@{ mes = $Mes; geradoEm = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); resumo = $resumo } |
    ConvertTo-Json | Set-Content -Path $ArqUltima -Encoding utf8NoBOM
}
Write-Host "Site gerado em $site"
