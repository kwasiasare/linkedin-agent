@description('Azure region for resources')
param location string

@description('Environment identifier for resource naming')
param environmentId string

@description('Virtual network resource ID')
param vnetId string

@description('Container Apps subnet resource ID')
param containerAppSubnetId string

@description('Container Registry resource ID')
param containerRegistryId string

@description('Container Registry name')
param containerRegistryName string

@description('Container Registry login server')
param containerRegistryLoginServer string

@description('Key Vault resource ID')
param keyVaultId string

@description('Key Vault name')
param keyVaultName string

@description('Storage Account resource ID')
param storageAccountId string

@description('Storage Account name')
param storageAccountName string

@description('File share name')
param fileShareName string

@description('Log Analytics Workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Application Insights connection string')
param applicationInsightsConnectionString string

@description('Container image tag to deploy')
param containerImageTag string

@description('Resource tags')
param tags object

var containerAppEnvName = toLower('${environmentId}-cae')
var containerAppName = toLower('${environmentId}-ca')
var managedIdentityName = toLower('${environmentId}-mi')

// Managed Identity for Container App
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

// Role assignment: ACR Pull
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistryId, managedIdentity.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: resourceId('Microsoft.ContainerRegistry/registries', containerRegistryName)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment: Key Vault Secrets User
resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultId, managedIdentity.id, '4633458b-17de-408a-b874-0445c86b69e6')
  scope: keyVaultId
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment: Storage File Data SMB Share Contributor
resource storageFileDataContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccountId, managedIdentity.id, '0c867c2a-1d8c-454a-a3db-ab2ea1bdc8bb')
  scope: storageAccountId
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0c867c2a-1d8c-454a-a3db-ab2ea1bdc8bb')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Container Apps Environment
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppSubnetId
      internal: true
    }
    zoneRedundant: false
  }
}

// Get storage account key for Azure Files mount
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistryLoginServer
          identity: managedIdentity.id
        }
      ]
      ingress: {
        external: false
        targetPort: 3000
        allowInsecure: false
        traffic: [
          {
            weight: 100
            latestRevision: true
          }
        ]
      }
      secrets: [
        {
          name: 'storage-key'
          value: storageAccount.listKeys().keys[0].value
        }
      ]
    }
    template: {
      revisionSuffix: containerImageTag
      containers: [
        {
          name: 'linkedin-agent'
          image: '${containerRegistryLoginServer}/linkedin-agent:${containerImageTag}'
          env: [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsightsConnectionString
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentity.properties.clientId
            }
            {
              name: 'KEY_VAULT_URI'
              value: 'https://${keyVaultName}${az.environment().suffixes.keyvaultDns}/'
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'FILE_SHARE_NAME'
              value: fileShareName
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              mountPath: '/app/data'
              volumeName: 'azure-files-volume'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'cron-scale-rule'
            custom: {
              type: 'cron'
              metadata: {
                timezone: 'UTC'
                start: '0 9 * * MON-FRI'
                end: '0 17 * * MON-FRI'
                desiredReplicas: '1'
              }
            }
          }
        ]
      }
      volumes: [
        {
          name: 'azure-files-volume'
          storageType: 'AzureFile'
          storageName: 'azure-files-storage'
        }
      ]
    }
  }
  dependsOn: [
    acrPullRoleAssignment
    keyVaultSecretsUserRoleAssignment
    storageFileDataContributorRoleAssignment
  ]
}

// Storage mount for Azure Files
resource storageMount 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppEnvironment
  name: 'azure-files-storage'
  properties: {
    azureFile: {
      accountName: storageAccountName
      shareName: fileShareName
      accountKey: storageAccount.listKeys().keys[0].value
      accessMode: 'ReadWrite'
    }
  }
}

@description('Container App internal URL')
output containerAppInternalUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'