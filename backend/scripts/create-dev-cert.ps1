$ErrorActionPreference = "Stop"

$outputDir = Join-Path $PSScriptRoot "..\\certs"
$friendlyName = "Front_1KR Local Dev"
$passwordText = "front1kr-local"
$cerPath = Join-Path $outputDir "localhost.cer"
$pfxPath = Join-Path $outputDir "localhost.pfx"
$passphrasePath = Join-Path $outputDir "passphrase.txt"

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$certificate = Get-ChildItem Cert:\\CurrentUser\\My |
  Where-Object { $_.FriendlyName -eq $friendlyName } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -DnsName "localhost", "127.0.0.1" `
    -CertStoreLocation "Cert:\\CurrentUser\\My" `
    -FriendlyName $friendlyName `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(2)
}

$securePassword = ConvertTo-SecureString -String $passwordText -AsPlainText -Force

Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT -Force | Out-Null
Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword -Force | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\\CurrentUser\\Root" | Out-Null
Set-Content -Path $passphrasePath -Value $passwordText -NoNewline -Encoding utf8

Write-Host "Trusted certificate created:"
Write-Host "  CER: $cerPath"
Write-Host "  PFX: $pfxPath"
Write-Host "  Password file: $passphrasePath"
Write-Host "HTTPS will be available at https://localhost:3443 after restarting the backend."
