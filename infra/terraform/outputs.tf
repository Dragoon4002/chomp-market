output "ips" {
  value = { for k, e in aws_eip.this : k => e.public_ip }
}

# sslip.io: <a-b-c-d>.sslip.io resolves to a.b.c.d, no DNS setup
output "domains" {
  value = { for k, e in aws_eip.this : k => "${replace(e.public_ip, ".", "-")}.sslip.io" }
}

# docker --platform per box
output "platforms" {
  value = { for k, a in local.arch : k => "linux/${a}" }
}
