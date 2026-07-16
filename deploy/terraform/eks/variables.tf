variable "name" { type = string; default = "effect-agent" }
variable "region" { type = string; default = "us-east-1" }
variable "vpc_cidr" { type = string; default = "10.42.0.0/16" }
variable "kubernetes_version" { type = string; default = "1.34" }
variable "tags" { type = map(string); default = {} }
