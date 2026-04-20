terraform {
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "tfstatelinkedinagent"
    container_name       = "tfstate"
    key                  = "linkedin-agent.tfstate"
  }
}