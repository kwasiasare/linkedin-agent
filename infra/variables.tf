variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "rg-linkedin-agent"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "East US"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "linkedin-agent"
}

variable "container_image" {
  description = "Container image for the LinkedIn agent"
  type        = string
  default     = "linkedin-agent:latest"
}

variable "storage_account_name" {
  description = "Storage account name for backend"
  type        = string
  default     = "stlinkedinagent"
}

variable "backend_container_name" {
  description = "Storage container name for terraform state"
  type        = string
  default     = "terraform-state"
}

variable "backend_key" {
  description = "Terraform state file key"
  type        = string
  default     = "linkedin-agent.tfstate"
}