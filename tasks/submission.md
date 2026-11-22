# Submission copy

## NEAR Hunt listing

- **Name:** Brawler Arena
- **Tagline (one line):** Real-time monster fights on NEAR: stake, bet, and verify every result on-chain.
- **Live:** https://13-54-190-122.sslip.io
- **Repo:** <public GitHub URL>
- **Video:** <YouTube / X video URL>
- **Category:** Gaming

**Description**

Brawler Arena is a 1v1 platform fighter where monsters knock each other off a floating stage. Host a room, stake NEAR, and the winner takes the pot. Spectators trade a live prediction market on the fight while it happens. Tournaments, leaderboards and match history are all backed by the platform contract.

Every settled match stores the SHA-256 of its full input tape on-chain. Because the sim is deterministic, anyone can open the replay page and their browser re-runs the fight, recomputes the hash and checks the winner against the contract: provable fairness without trusting the server.

Monsters are NFTs: their DNA sets their stats, and you can hatch, breed, sell and rent them. The NFT is locked while it fights.

Try it in five seconds: hit "Practice vs bot" on the title screen, no wallet needed. No opponent online? Host a free room and press "Call bot": a bot joins (marked "bot"), so there is always someone to fight.

**Built with:** NEAR smart contracts (Rust, near-sdk), NEAR wallet selector, rollback netcode (WebRTC + Rust relay), Next.js.

## X post

Brawler Arena is live on NEAR testnet 🥊

Real-time monster fights where:
- you stake NEAR, winner takes the pot
- spectators trade a live prediction market on the fight
- every result is provably fair: the input tape's hash is on-chain, replay it in your browser and check

Play now, no wallet needed: https://13-54-190-122.sslip.io

<video>

@NEARProtocol #NEAR #NEARHunt
