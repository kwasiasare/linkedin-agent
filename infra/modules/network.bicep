@description('Azure region for resources')
param location string

@description('Environment identifier for resource naming')
param environmentId string

@description('Resource tags')
param tags object

var vnetName = toLower('${environmentId}-vnet')
var containerAppSubnetName = 'container-app-subnet'
var privateEndpointSubnetName = 'private-endpoint-subnet'
var keyVaultDnsZoneName = 'privatelink.vaultcore.azure.net'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: containerAppSubnetName
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            {
              name: 'Microsoft.App/environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Storage'
              locations: [
                location
              ]
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: '10.0.2.0/24'
        }
      }
    ]
  }
}

resource keyVaultDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: keyVaultDnsZoneName
  location: 'global'
  tags: tags
}

resource keyVaultDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: keyVaultDnsZone
  name: '${vnetName}-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

@description('Virtual network resource ID')
output vnetId string = vnet.id

@description('Container Apps subnet resource ID')
output containerAppSubnetId string = vnet.properties.subnets[0].id

@description('Private endpoint subnet resource ID')
output privateEndpointSubnetId string = vnet.properties.subnets[1].id

@description('Key Vault private DNS zone resource ID')
output keyVaultDnsZoneId string = keyVaultDnsZone.id