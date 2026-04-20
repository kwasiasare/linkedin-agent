resource "azurerm_key_vault" {
  name                       = "kv-${var.project_name}-${random_string.suffix.result}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    virtual_network_subnet_ids = [azurerm_subnet.main.id]
  }

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Get",
      "List",
      "Set",
      "Delete",
      "Recover",
      "Backup",
      "Restore"
    ]
  }

  tags = local.common_tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_key_vault_access_policy" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_container_app.main.identity[0].principal_id

  secret_permissions = [
    "Get",
    "List"
  ]
}

resource "azurerm_key_vault_access_policy" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_container_app_job.main.identity[0].principal_id

  secret_permissions = [
    "Get",
    "List"
  ]
}

resource "azurerm_role_assignment" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_container_app.main.identity[0].principal_id
}

resource "azurerm_role_assignment" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_container_app_job.main.identity[0].principal_id
}

resource "azurerm_role_assignment" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_container_app.main.identity[0].principal_id
}

resource "azurerm_role_assignment" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_container_app_job.main.identity[0].principal_id
}

resource "azurerm_role_assignment" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage File Data SMB Share Contributor"
  principal_id         = azurerm_container_app.main.identity[0].principal_id
}

resource "azurerm_role_assignment" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage File Data SMB Share Contributor"
  principal_id         = azurerm_container_app_job.main.identity[0].principal_id
}