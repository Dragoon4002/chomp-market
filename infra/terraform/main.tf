# server: game server + bots (rooms in memory -> exactly one, no ASG/ALB). clients: game client + market.

data "aws_ec2_instance_type" "this" {
  for_each      = var.instance_types
  instance_type = each.value
}

locals {
  arch = { for k, t in data.aws_ec2_instance_type.this : k => contains(t.supported_architectures, "arm64") ? "arm64" : "amd64" }
}

data "aws_ami" "ubuntu" {
  for_each    = toset(values(local.arch))
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-${each.key}-server-*"]
  }
}

resource "aws_key_pair" "this" {
  key_name   = var.name
  public_key = file(pathexpand(var.ssh_public_key))
}

resource "aws_security_group" "this" {
  name        = var.name
  description = "brawler boxes"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = var.ssh_cidr
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "this" {
  for_each               = var.instance_types
  ami                    = data.aws_ami.ubuntu[local.arch[each.key]].id
  instance_type          = each.value
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]

  # rust release build in docker needs more than the 8G default
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = { Name = "${var.name}-${each.key}" }

  # new AMI releases shouldn't replace the box (and drop in-memory rooms)
  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "this" {
  for_each = aws_instance.this
  instance = each.value.id
  domain   = "vpc"
}
