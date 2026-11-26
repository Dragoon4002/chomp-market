#!/usr/bin/env bash
# Idempotent devnet setup (tasks/devnet-spec.md §5). Usage: scripts/devnet-setup.sh [--only chomp|pet-den|sealed-house]
# --only: deploy just that program (skips faucet/referee funding), then init + register.
set -euo pipefail
cd "$(dirname "$0")/.."
K=.keys
ONLY=""
[[ "${1:-}" == "--only" ]] && ONLY="${2:?--only needs a name}"

pk() { solana-keygen pubkey "$1"; }
topup() { # topup <pubkey> <target SOL>
  local have; have=$(solana balance "$1" --lamports | awk '{print $1}')
  local want; want=$(awk -v t="$2" 'BEGIN{printf "%d", t*1e9}')
  if (( have < want )); then
    solana transfer --allow-unfunded-recipient "$1" "$(awk -v d=$((want - have)) 'BEGIN{printf "%.9f", d/1e9}')" >/dev/null
    echo "funded $1 to $2 SOL"
  else echo "ok $1 has $(solana balance "$1")"; fi
}
deploy() { # deploy <name> <keypair> <so>
  [[ -n "$ONLY" && "$ONLY" != "$1" ]] && return
  [[ -f "$3" ]] || { echo "skip $1: $3 missing"; return; }
  local id; id=$(pk "$2")
  if solana program show "$id" >/dev/null 2>&1; then
    local tmp; tmp=$(mktemp)
    solana program dump "$id" "$tmp" >/dev/null
    if cmp -s -n "$(stat -c%s "$3")" "$3" "$tmp"; then rm -f "$tmp"; echo "skip $1: same hash deployed at $id"; return; fi
    rm -f "$tmp"
  fi
  solana program deploy --program-id "$2" "$3"
}

if [[ -z "$ONLY" ]]; then
  topup "$(pk $K/faucet.json)" 2
  for r in brawler keyfall coinflip ribbon monster-siege; do topup "$(pk $K/referee-$r.json)" 0.05; done
fi

deploy chomp $K/chomp.json programs/chomp/target/deploy/chomp.so
deploy pet-den $K/pet_den.json games/pet-den/program/target/deploy/pet_den.so
deploy sealed-house $K/sealed_house.json games/sealed-house/program/target/deploy/sealed_house.so

CHOMP=$(pk $K/chomp.json)
CHOMP_PROGRAM_ID=$CHOMP node --experimental-strip-types --no-warnings scripts/devnet-init.ts

cat <<ENV

# market/.env.local
NEXT_PUBLIC_CHOMP_ID=$CHOMP
NEXT_PUBLIC_PET_DEN_ID=$(pk $K/pet_den.json)
NEXT_PUBLIC_SEALED_HOUSE_ID=$(pk $K/sealed_house.json)
FAUCET_KEYPAIR=../.keys/faucet.json

# game servers (per game: REFEREE_KEYPAIR=.keys/referee-<slug>.json)
CHOMP_PROGRAM_ID=$CHOMP
REFEREE_KEYPAIR=.keys/referee-brawler.json
ENV
