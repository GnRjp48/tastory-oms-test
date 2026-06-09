$ErrorActionPreference = "Stop"

$projectUrl = "https://myqjlxaruiomjrdcbrux.supabase.co"
$publishableKey = "sb_publishable_fIobfoPEP01OpsVenuT6UQ_nIH7gQFC"
$email = "tastory4u@gmail.com"

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$currentSecure = Read-Host "Current temporary password" -AsSecureString
$newSecure = Read-Host "New password (minimum 10 characters)" -AsSecureString
$confirmSecure = Read-Host "Confirm new password" -AsSecureString

$currentPassword = ConvertFrom-SecureValue $currentSecure
$newPassword = ConvertFrom-SecureValue $newSecure
$confirmedPassword = ConvertFrom-SecureValue $confirmSecure

try {
  if ($newPassword.Length -lt 10) {
    throw "The new password must contain at least 10 characters."
  }

  if ($newPassword -cne $confirmedPassword) {
    throw "The new passwords do not match."
  }

  $session = Invoke-RestMethod `
    -Method Post `
    -Uri "$projectUrl/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $publishableKey } `
    -ContentType "application/json" `
    -Body (@{
      email = $email
      password = $currentPassword
    } | ConvertTo-Json)

  Invoke-RestMethod `
    -Method Put `
    -Uri "$projectUrl/auth/v1/user" `
    -Headers @{
      apikey = $publishableKey
      Authorization = "Bearer $($session.access_token)"
    } `
    -ContentType "application/json" `
    -Body (@{ password = $newPassword } | ConvertTo-Json) | Out-Null

  Write-Host "Jane's password was changed successfully."
} finally {
  $currentPassword = $null
  $newPassword = $null
  $confirmedPassword = $null
}
