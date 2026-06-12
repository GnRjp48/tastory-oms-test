param(
  [string]$OmsDomain = "oms.tastory4u.com",
  [string]$ExpectedCname = "gnrjp48.github.io"
)

$ErrorActionPreference = "Stop"

function Test-Url {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -MaximumRedirection 10
    [pscustomobject]@{
      Url = $Url
      Status = $response.StatusCode
      FinalUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
      Title = ([regex]::Match($response.Content, "<title>(.*?)</title>")).Groups[1].Value
    }
  } catch {
    [pscustomobject]@{
      Url = $Url
      Status = "FAILED"
      FinalUrl = ""
      Title = $_.Exception.Message
    }
  }
}

$cname = Resolve-DnsName $OmsDomain -Type CNAME -ErrorAction Stop |
  Where-Object Type -eq "CNAME" |
  Select-Object -First 1

if (-not $cname -or $cname.NameHost.TrimEnd(".") -ne $ExpectedCname) {
  throw "Expected $OmsDomain to resolve to $ExpectedCname."
}

$results = @(
  Test-Url "https://$OmsDomain/"
  Test-Url "https://$OmsDomain/manifest.webmanifest"
  Test-Url "https://$OmsDomain/sw.js"
  Test-Url "https://$OmsDomain/config.js"
)

$results | Format-Table -AutoSize

if ($results.Where({ $_.Status -ne 200 }).Count -gt 0) {
  throw "One or more OMS endpoints failed verification."
}
