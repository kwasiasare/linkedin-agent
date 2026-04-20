output "container_app_fqdn" {
  description = "FQDN of the Container App"
  value       = azurerm_container_app.linkedin_agent.latest_revision_fqdn
}

output "container_registry_login_server" {
  description = "Login server of the Container Registry"
  value       = azurerm_container_registry.main.login_server
}

output "key_vault_uri" {
  description = "URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

output "application_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "file_share_name" {
  description = "Name of the Azure File Share"
  value       = azurerm_storage_share.main.name
}