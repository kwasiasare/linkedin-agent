resource "azurerm_container_app_environment" "main" {
  name                = "cae-${var.project_name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = local.common_tags
}

resource "azurerm_container_app" "linkedin_agent" {
  name                         = "ca-${var.project_name}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "linkedin-agent"
      image  = "${azurerm_container_registry.main.login_server}/${var.container_image}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_container_app.linkedin_agent.identity[0].principal_id
      }

      env {
        name  = "KEY_VAULT_URL"
        value = azurerm_key_vault.main.vault_uri
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
      }

      env {
        name  = "STORAGE_ACCOUNT_NAME"
        value = azurerm_storage_account.main.name
      }

      env {
        name  = "FILE_SHARE_NAME"
        value = azurerm_storage_share.main.name
      }

      volume_mounts {
        name = "data-volume"
        path = "/app/data"
      }

      volume_mounts {
        name = "logs-volume"
        path = "/app/logs"
      }
    }

    volume {
      name         = "data-volume"
      storage_type = "AzureFile"
      storage_name = "linkedin-agent-storage"
    }

    volume {
      name         = "logs-volume"
      storage_type = "AzureFile"
      storage_name = "linkedin-agent-storage"
    }
  }

  tags = local.common_tags

  depends_on = [
    azurerm_role_assignment.container_app_acr_pull,
    azurerm_role_assignment.container_app_keyvault_secrets,
    azurerm_role_assignment.container_app_storage_files
  ]
}

resource "azurerm_container_app_environment_storage" "main" {
  name                         = "linkedin-agent-storage"
  container_app_environment_id = azurerm_container_app_environment.main.id
  account_name                 = azurerm_storage_account.main.name
  share_name                   = azurerm_storage_share.main.name
  access_key                   = azurerm_storage_account.main.primary_access_key
  access_mode                  = "ReadWrite"
}

resource "azurerm_container_registry" "main" {
  name                = "acr${replace(var.project_name, "-", "")}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false

  tags = local.common_tags
}