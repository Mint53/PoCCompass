targetScope = 'resourceGroup'

param location string
param appLocation string
param namePrefix string
param appServiceSku string
param modelName string
param modelVersion string
param modelSkuName string
param modelCapacity int
param adminEmails string
param deployerPrincipalId string
param authClientId string

var suffix = take(uniqueString(resourceGroup().id), 5)
var webAppName = '${namePrefix}-web-${suffix}'
var functionAppName = '${namePrefix}-func-${suffix}'
var planName = '${namePrefix}-plan'
var cosmosName = '${namePrefix}-cosmos-${suffix}'
var foundryName = '${namePrefix}-foundry-${suffix}'
var foundryProjectName = 'poc-compass'
var keyVaultName = 'pcc-kv-${suffix}'
var storageName = toLower('pccst${suffix}')
var logAnalyticsName = '${namePrefix}-law'
var appInsightsName = '${namePrefix}-appi'
var cosmosDatabaseName = 'poc-compass'
var functionApiUrl = 'https://${functionAppName}.azurewebsites.net/api'
var webAppUrl = 'https://${webAppName}.azurewebsites.net'
var openAiEndpoint = 'https://${foundryName}.openai.azure.com/'

// Must match PocCompassFunc/app/constants/enums.py (tests/test_spec_sync.py checks this).
var cosmosContainers = [
  { name: 'projects', partitionKey: '/id' }
  { name: 'project_items', partitionKey: '/projectId' }
  { name: 'evaluations', partitionKey: '/projectId' }
  { name: 'health_snapshots', partitionKey: '/projectId' }
  { name: 'reports', partitionKey: '/projectId' }
  { name: 'mode_definitions', partitionKey: '/id' }
  { name: 'chat_messages', partitionKey: '/projectId' }
]

// Built-in role definition IDs
var roleKeyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var roleKeyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
var roleOpenAiUser = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var cosmosDataContributor = '00000000-0000-0000-0000-000000000002'

// ---------------- monitoring ----------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

// ---------------- storage (Functions runtime only) ----------------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// ---------------- Cosmos DB (serverless, Entra ID auth only) ----------------

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [
      { locationName: location, failoverPriority: 0, isZoneRedundant: false }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: cosmosDatabaseName
  properties: {
    resource: { id: cosmosDatabaseName }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for c in cosmosContainers: {
  parent: cosmosDb
  name: c.name
  properties: {
    resource: {
      id: c.name
      partitionKey: { paths: [ c.partitionKey ], kind: 'Hash' }
    }
  }
}]

// ---------------- AI Foundry ----------------

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryName
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: foundryName
    allowProjectManagement: true
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: foundryProjectName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'PoC Compass'
    description: 'PoC Compass task alignment evaluation'
  }
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: modelName
  // The account accepts one write at a time; creating the project and the deployment in parallel fails with RequestConflict.
  dependsOn: [ foundryProject ]
  sku: {
    name: modelSkuName
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

// ---------------- Key Vault (function key, auth client secret) ----------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource storageConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'storage-connection-string'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  }
}

// ---------------- App Service ----------------

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: appLocation
  kind: 'linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: appLocation
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: 'SystemAssigned'
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      // The browser never calls the API directly (Next.js proxies it), so no CORS origins.
      cors: { allowedOrigins: [] }
    }
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: appLocation
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: 'SystemAssigned'
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      // Next.js standalone binds to $HOSTNAME, which App Service sets to the container name; force all interfaces.
      appCommandLine: 'HOSTNAME=0.0.0.0 node server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// ---------------- role assignments ----------------

resource funcKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, roleKeyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsUser)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, roleKeyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsUser)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, functionApp.id, roleOpenAiUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleOpenAiUser)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcCosmosData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, functionApp.id, cosmosDataContributor)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}'
    principalId: functionApp.identity.principalId
    scope: cosmos.id
  }
}

resource deployerOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(foundry.id, deployerPrincipalId, roleOpenAiUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleOpenAiUser)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerKvOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(keyVault.id, deployerPrincipalId, roleKeyVaultSecretsOfficer)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsOfficer)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerCosmosData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = if (!empty(deployerPrincipalId)) {
  parent: cosmos
  name: guid(cosmos.id, deployerPrincipalId, cosmosDataContributor)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}'
    principalId: deployerPrincipalId
    scope: cosmos.id
  }
}

// ---------------- app settings ----------------
// Names must match PocCompassFunc/local.settings.json.example and PocCompassFront/.env.example.

resource functionSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'appsettings'
  dependsOn: [ funcKvSecretsUser ]
  properties: {
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'python'
    AzureWebJobsStorage: '@Microsoft.KeyVault(SecretUri=${storageConnectionSecret.properties.secretUri})'
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
    ENABLE_ORYX_BUILD: 'true'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    STORAGE_BACKEND: 'cosmos'
    COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    COSMOS_DATABASE_NAME: cosmosDatabaseName
    AZURE_OPENAI_ENDPOINT: openAiEndpoint
    AZURE_OPENAI_DEPLOYMENT: modelDeployment.name
    AZURE_OPENAI_API_VERSION: '2025-04-01-preview'
    AZURE_OPENAI_REASONING_EFFORT: 'low'
    ADMIN_EMAILS: adminEmails
  }
}

resource webSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: webApp
  name: 'appsettings'
  dependsOn: [ webKvSecretsUser ]
  properties: {
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    BACKEND_URL: functionApiUrl
    // Secret value is written by scripts/deploy.sh (function host key cannot be read before code is deployed).
    BACKEND_FUNCTION_KEY: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=backend-function-key)'
    MICROSOFT_PROVIDER_AUTHENTICATION_SECRET: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=auth-client-secret)'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    WEBSITE_NODE_DEFAULT_VERSION: '~20'
    NODE_ENV: 'production'
  }
}

resource webAuth 'Microsoft.Web/sites/config@2023-12-01' = if (!empty(authClientId)) {
  parent: webApp
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: authClientId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
          openIdIssuer: '${environment().authentication.loginEndpoint}${subscription().tenantId}/v2.0'
        }
      }
    }
    login: {
      tokenStore: { enabled: true }
    }
  }
}

output webAppName string = webApp.name
output webAppUrl string = webAppUrl
output functionAppName string = functionApp.name
output functionApiUrl string = functionApiUrl
output keyVaultName string = keyVault.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output openAiEndpoint string = openAiEndpoint
output modelDeploymentName string = modelDeployment.name
