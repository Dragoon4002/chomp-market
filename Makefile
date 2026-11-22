COMPOSE := docker compose -f infra/compose.yml

TF := terraform -chdir=infra/terraform

.PHONY: dev down logs test wasm e2e deploy-infra push-image push-agents push-client push-market ansible deploy

dev:
	$(COMPOSE) up --build -d
	@echo "brawler ws -> ws://localhost:$${BRAWLER_PORT:-8787}"
	@echo "ribbon ws -> ws://localhost:$${RIBBON_PORT:-8788}"
	@echo "keyfall ws -> ws://localhost:$${KEYFALL_PORT:-8789}"

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

test:
	npm test
	cargo test --workspace
	cd contracts/platform && cargo test
	cd games/brawler/contract && cargo test
	$(MAKE) e2e

wasm:
	cd contracts/platform && cargo near build non-reproducible-wasm
	cd games/brawler/contract && cargo near build non-reproducible-wasm

e2e: wasm
	cd contracts/e2e && cargo test -- --nocapture

deploy-infra:
	$(TF) init
	$(TF) apply

# built locally (a release build on a 2G box takes >10 min and starves ssh), loaded over ssh
# two boxes (terraform outputs): server = brawler-server + agents, clients = game client + market
export AWS_PROFILE ?= near-games
out = $$($(TF) output -json $(1) | jq -r .$(2))
ship = docker buildx build --platform $(call out,platforms,$(2)) -f infra/$(1).Dockerfile -t $(3) --load $(4) . && \
	docker save $(3) | gzip | ssh ubuntu@$(call out,ips,$(2)) 'gunzip | sudo docker load'
SERVER_DOMAIN = $(call out,domains,server)
CLIENTS_DOMAIN = $(call out,domains,clients)

push-image:
	$(call ship,brawler-server,server,brawler-server)
	$(call ship,ribbon-server,server,ribbon-server)
	$(call ship,keyfall-server,server,keyfall-server)

push-agents:
	$(call ship,agents,server,brawler-agents)

push-client:
	$(call ship,brawler-client,clients,brawler-client,--build-arg NEXT_PUBLIC_SERVER_URL=wss://$(SERVER_DOMAIN) --build-arg NEXT_PUBLIC_MARKET_URL=https://market.$(CLIENTS_DOMAIN))

push-market:
	$(call ship,market,clients,brawler-market,--build-arg NEXT_PUBLIC_BRAWLER_URL=https://$(CLIENTS_DOMAIN))

# REFEREE_KEY etc. from env (see infra/README.md). extra flags: make deploy ANSIBLE_ARGS="..."
PLAY = ANSIBLE_CONFIG=infra/ansible/ansible.cfg ansible-playbook infra/ansible/playbook.yml $(ANSIBLE_ARGS)
ansible:
	$(PLAY) -i "$(call out,ips,server)," -e role=server -e domain="$(SERVER_DOMAIN)"
	$(PLAY) -i "$(call out,ips,clients)," -e role=clients -e domain="$(CLIENTS_DOMAIN)"

# fresh box has no docker until the first pass; images must be loaded before compose up
deploy:
	$(MAKE) ansible ANSIBLE_ARGS="--skip-tags up $(ANSIBLE_ARGS)"
	$(MAKE) push-image push-agents push-client push-market
	$(MAKE) ansible
