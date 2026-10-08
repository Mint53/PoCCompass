targetScope = 'subscription'

@description('リソースグループ名')
param resourceGroupName string = 'poc-compass-rg'

@description('リソースグループ・データ・AI Foundry のリージョン')
param location string = 'japaneast'

@description('App Service（Web / Functions）のリージョン。Japan East は App Service の VM クォータが上限のため Japan West')
param appLocation string = 'japanwest'

@description('リソース名のプレフィックス（小文字・数字・ハイフン）')
param namePrefix string = 'poc-compass'

@description('Web と Functions で共有する既存 Linux App Service Plan の名前')
param appServicePlanName string = 'icc-gain-app-service-plan-linux-02'

@description('共有する既存 App Service Plan があるリソース グループ名')
param appServicePlanResourceGroup string = 'icc-gain-shared-rg'

@description('AI Foundry にデプロイするモデル')
param modelName string = 'gpt-5.4'
param modelVersion string = '2026-03-05'
param modelSkuName string = 'GlobalStandard'
@description('モデルの容量（1 = 1,000 TPM）')
param modelCapacity int = 50

@description('管理者のメールアドレス（カンマ区切り）。モード定義を編集できる')
param adminEmails string = ''

@description('デプロイ実行者のオブジェクト ID。ローカル開発用に Cosmos / Foundry / Key Vault の権限を付与する。空なら付与しない')
param deployerPrincipalId string = ''

@description('Entra ID アプリ登録のクライアント ID。空なら App Service 認証を構成しない')
param authClientId string = ''

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    app: 'poc-compass'
  }
}

module resources 'modules/resources.bicep' = {
  name: 'poc-compass-resources'
  scope: rg
  params: {
    location: location
    appLocation: appLocation
    namePrefix: namePrefix
    appServicePlanName: appServicePlanName
    appServicePlanResourceGroup: appServicePlanResourceGroup
    modelName: modelName
    modelVersion: modelVersion
    modelSkuName: modelSkuName
    modelCapacity: modelCapacity
    adminEmails: adminEmails
    deployerPrincipalId: deployerPrincipalId
    authClientId: authClientId
  }
}

output resourceGroupName string = rg.name
output webAppName string = resources.outputs.webAppName
output webAppUrl string = resources.outputs.webAppUrl
output functionAppName string = resources.outputs.functionAppName
output functionApiUrl string = resources.outputs.functionApiUrl
output keyVaultName string = resources.outputs.keyVaultName
output cosmosEndpoint string = resources.outputs.cosmosEndpoint
output openAiEndpoint string = resources.outputs.openAiEndpoint
output modelDeploymentName string = resources.outputs.modelDeploymentName
