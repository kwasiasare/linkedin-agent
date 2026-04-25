@description('Azure region for resources')
param location string

@description('Environment identifier for resource naming')
param environmentId string

@description('Resource tags')
param tags object

var registryName = toLower(replace('${environmentId}acr${uniqueString(resourceGroup().id)}', '-', ''))

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

@description('Container Registry resource ID')
output containerRegistryId string = containerRegistry.id

@description('Container Registry name')
output containerRegistryName string = containerRegistry.name

@description('Container Registry login server')
output containerRegistryLoginServer string = containerRegistry.properties.loginServer