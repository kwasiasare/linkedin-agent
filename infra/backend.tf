terraform {
  backend "azurerm" {
    resource_group_name  = var.storage_account_name
    storage_account_name = var.storage_account_name
    container_name       = var.backend_container_name
    key                  = var.backend_key
    use_azuread_auth     = true
  }
}