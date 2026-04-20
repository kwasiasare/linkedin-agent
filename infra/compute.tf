resource "azurerm_container_registry" {
  name                = "acr${var.project_name}${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false

  tags = local.common_tags
}

resource "azurerm_container_app_environment" {
  name                = "cae-${var.project_name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = local.common_tags
}

resource "azurerm_container_app" {
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
        name        = "KEY_VAULT_URL"
        value       = azurerm_key_vault.main.vault_uri
      }

      env {
        name        = "STORAGE_ACCOUNT_NAME"
        value       = azurerm_storage_account.main.name
      }

      env {
        name        = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        secret_name = "appinsights-connection-string"
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
      storage_name = "data-storage"
    }

    volume {
      name         = "logs-volume"
      storage_type = "AzureFile"
      storage_name = "logs-storage"
    }
  }

  secret {
    name  = "appinsights-connection-string"
    value = azurerm_application_insights.main.connection_string
  }

  tags = local.common_tags

  depends_on = [
    azurerm_role_assignment.acr_pull,
    azurerm_role_assignment.key_vault_secrets,
    azurerm_role_assignment.storage_contributor
  ]
}

resource "azurerm_container_app_job" {
  name                         = "caj-${var.project_name}"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id

  replica_timeout_in_seconds = 3600
  replica_retry_limit        = 1
  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  schedule_trigger_config {
    cron_expression = var.cron_schedule
  }

  template {
    container {
      name   = "linkedin-agent"
      image  = "${azurerm_container_registry.main.login_server}/${var.container_image}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "KEY_VAULT_URL"
        value = azurerm_key_vault.main.vault_uri
      }

      env {
        name  = "STORAGE_ACCOUNT_NAME"
        value = azurerm_storage_account.main.name
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.main.connection_string
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
      storage_name = "data-storage"
    }

    volume {
      name         = "logs-volume"
      storage_type = "AzureFile"
      storage_name = "logs-storage"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}