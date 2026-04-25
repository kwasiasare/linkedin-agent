targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Project name for resource naming')
param projectName string = 'linkedin-agent'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Container image tag to deploy')
param containerImageTag string = 'v1.0.0'

@description('Storage file share size in GB')
param storageFileShareSizeGB int = 5

@description('Key Vault soft delete retention period in days')
param keyVaultSoftDeleteRetentionDays int = 90

@description('LinkedIn API credentials (secure)')
@secure()
param linkedinApiKey string = uniqueString(resourceGroup().id, 'linkedin')

@description('Anthropic Claude API key (secure)')
@secure()
param anthropicApiKey string = uniqueString(resourceGroup().id, 'anthropic')

var uniqueSuffix = uniqueString(resourceGroup().id)
var environmentId = '${projectName}-${environment}'

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

module network 'modules/network.bicep' = {
  name: 'network-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    storageFileShareSizeGB: storageFileShareSizeGB
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

module container 'modules/container.bicep' = {
  name: 'container-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

module security 'modules/security.bicep' = {
  name: 'security-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    vnetId: network.outputs.vnetId
    subnetId: network.outputs.privateEndpointSubnetId
    keyVaultSoftDeleteRetentionDays: keyVaultSoftDeleteRetentionDays
    linkedinApiKey: linkedinApiKey
    anthropicApiKey: anthropicApiKey
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

module compute 'modules/compute.bicep' = {
  name: 'compute-${uniqueSuffix}'
  params: {
    location: location
    environmentId: environmentId
    vnetId: network.outputs.vnetId
    containerAppSubnetId: network.outputs.containerAppSubnetId
    containerRegistryId: container.outputs.containerRegistryId
    containerRegistryName: container.outputs.containerRegistryName
    containerRegistryLoginServer: container.outputs.containerRegistryLoginServer
    keyVaultId: security.outputs.keyVaultId
    keyVaultName: security.outputs.keyVaultName
    storageAccountId: storage.outputs.storageAccountId
    storageAccountName: storage.outputs.storageAccountName
    fileShareName: storage.outputs.fileShareName
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    containerImageTag: containerImageTag
    tags: {
      environment: environment
      project: projectName
      managedBy: 'bicep'
    }
  }
}

@description('Container App URL (internal access only)')
output containerAppUrl string = compute.outputs.containerAppInternalUrl

@description('Container Registry login server')
output containerRegistryLoginServer string = container.outputs.containerRegistryLoginServer

@description('Key Vault URI')
output keyVaultUri string = security.outputs.keyVaultUri

@description('Storage Account name')
output storageAccountName string = storage.outputs.storageAccountName

@description('Application Insights connection string (masked)')
output applicationInsightsInstrumentationKey string = monitoring.outputs.applicationInsightsInstrumentationKey