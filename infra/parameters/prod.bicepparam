using '../main.bicep'

// Values that are NOT secret. Secrets are written to Key Vault by scripts/deploy.sh.
param resourceGroupName = 'poc-compass-rg'
param location = 'japaneast'
param appLocation = 'japanwest'
param namePrefix = 'poc-compass'
param appServiceSku = 'B1'
param modelName = 'gpt-5.4'
param modelVersion = '2026-03-05'
param modelSkuName = 'GlobalStandard'
param modelCapacity = 50
// Entra ID app registration "PoC Compass" (not a secret). Its client secret lives in Key Vault: auth-client-secret
param authClientId = '1266e3bc-a0b9-44f3-a56f-c597557a4469'
// adminEmails / deployerPrincipalId are passed by scripts/deploy.sh
