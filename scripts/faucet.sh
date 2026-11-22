#!/usr/bin/env bash
# Usage: scripts/faucet.sh <wallet.testnet> <amount_near>
# Testnet faucet only funds NEW accounts, so: create throwaway via faucet,
# delete it with beneficiary=<wallet> (moves its balance), repeat until >= amount.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <wallet.testnet> <amount_near>"; exit 1; }
TO=$1 WANT=$2
NET="network-config testnet"
got=0 i=0
while awk "BEGIN{exit !($got < $WANT)}"; do
  i=$((i+1)); tmp="fund-$(date +%s)-$i.testnet"
  near account create-account sponsor-by-faucet-service "$tmp" \
    autogenerate-new-keypair save-to-legacy-keychain $NET create >/dev/null \
    || { rm -f ~/.near-credentials/testnet/"$tmp".json ~/.near-credentials/testnet/"$tmp"/*.json
         rmdir ~/.near-credentials/testnet/"$tmp" 2>/dev/null; echo "faucet failed (429 rate limit?) after ~$got NEAR"; exit 1; }
  sleep 2 # ponytail: wait for finality; bump if view fails
  bal=$(near tokens "$tmp" view-near-balance $NET now 2>&1 | grep -oE '[0-9.]+ NEAR' | head -1 | cut -d' ' -f1)
  near account delete-account "$tmp" beneficiary "$TO" $NET sign-with-legacy-keychain send >/dev/null
  rm -f ~/.near-credentials/testnet/"$tmp".json ~/.near-credentials/testnet/"$tmp"/*.json
  rmdir ~/.near-credentials/testnet/"$tmp"
  got=$(awk "BEGIN{print $got + ${bal:-0}}")
  echo "[$i] +${bal:-?} NEAR -> $TO (total ~$got)"
done
