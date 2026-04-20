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

variable "cron_schedule" {
  description = "Cron schedule for the LinkedIn agent"
  type        = string
  default     = "0 9 * * 1-5"
}

variable "storage_size_gb" {
  description = "Storage allocation in GB"
  type        = number
  default     = 5
}