# near-games org SCP only allows EC2 in ap-southeast-2
variable "region" {
  type    = string
  default = "ap-southeast-2"
}

variable "name" {
  type    = string
  default = "brawler-arena"
}

variable "instance_types" {
  type = map(string)
  # account is on the free-tier plan: t4g.small is the biggest arm64; m7i-flex.large (x86, 8G) the biggest overall
  default = { server = "t4g.small", clients = "m7i-flex.large" }
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH, e.g. 203.0.113.4/32"
  type        = string

  validation {
    condition     = can(cidrhost(var.ssh_cidr, 0))
    error_message = "ssh_cidr must be a valid CIDR."
  }
}

variable "ssh_public_key" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "profile" {
  type    = string
  default = "near-games"
}
