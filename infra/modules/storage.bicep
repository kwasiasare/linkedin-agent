@description('Azure region for resources')
param location string

@description('Environment identifier for resource naming')
param environmentId string

@description('File share size in GB')
param storageFileShareSizeGB int

@description('Resource tags')
param tags object

var storageAccountName = toLower(replace('${take(environmentId, 15)}st${uniqueString(resourceGroup().id)}', '-', ''))
var fileShareName = 'linkedin-agent-data'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    shareDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: fileShareName
  properties: {
    shareQuota: storageFileShareSizeGB
    enabledProtocols: 'SMB'
    accessTier: 'Hot'
  }
}

@description('Storage Account resource ID')
output storageAccountId string = storageAccount.id

@description('Storage Account name')
output storageAccountName string = storageAccount.name

@description('File share name')
output fileShareName string = fileShare.name

@description('Storage Account primary key (for Azure Files mount)')
output storageAccountKey string = storageAccount.listKeys().keys[0].value