# Stellar Blockchain Write — Load-Test Suite

This directory contains [k6](https://k6.io) load-test scenarios that exercise the
`POST /medical-records` path end-to-end, including the Stellar transaction anchoring
step. It closes the gap identified in the issue: blockchain write throughput was the
most likely performance bottleneck but had no baseline data.

---

## Directory layout

```
load-tests/
├── run-stellar-load-tests.sh          ← convenience runner (wraps k6 CLI)
├── results/                           ← JSON output written here (git-ignored)
└── stellar-write/
    ├── smoke.js                       ← 1 VU × 30 s  – sanity check
    ├── stellar-write.test.js          ← smoke + ramp + stress in one file
    ├── stress.js                      ← 50 VU ramp – find the breaking point
    └── soak.js                        ← 10 VU × 30 min – detect slow leaks
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [k6](https://k6.io/docs/get-started/installation/) | ≥ 0.49 | `brew install k6` / `choco install k6` / Docker |
| Running API | – | `docker compose -f docker-compose.local.yml up` |
| Valid JWT | – | Log in via `POST /auth/login` and copy the token |

> **Testnet accounts** — the test payload sets `anchorToBlockchain: true`.  
> Stellar testnet accounts can be funded for free at  
> <https://laboratory.stellar.org/#account-creator?network=test>

---

## Running the tests

### 1. Quick sanity check (smoke)

```bash
k6 run \
  --env BASE_URL=http://localhost:3000 \
  --env AUTH_TOKEN=<your-jwt> \
  load-tests/stellar-write/smoke.js
```

Expect: all checks green, no Stellar errors, p95 < 10 s.

### 2. Full scenario suite (smoke → ramp → stress)

```bash
k6 run \
  --env BASE_URL=http://localhost:3000 \
  --env AUTH_TOKEN=<your-jwt> \
  load-tests/stellar-write/stellar-write.test.js
```

The three scenarios run back-to-back (~14 min total). k6 prints a summary
and writes `results/stellar-write-summary.json`.

### 3. Stress only

```bash
k6 run \
  --env BASE_URL=http://localhost:3000 \
  --env AUTH_TOKEN=<your-jwt> \
  load-tests/stellar-write/stress.js
```

### 4. Soak (30 min endurance)

```bash
k6 run \
  --env BASE_URL=http://localhost:3000 \
  --env AUTH_TOKEN=<your-jwt> \
  load-tests/stellar-write/soak.js
```

### 5. Convenience runner

```bash
# local defaults
./load-tests/run-stellar-load-tests.sh

# testnet with JWT
./load-tests/run-stellar-load-tests.sh testnet "<jwt>" "https://api.testnet.example.com"

# single scenario
SCENARIO=smoke ./load-tests/run-stellar-load-tests.sh
SCENARIO=stress ./load-tests/run-stellar-load-tests.sh testnet "<jwt>"
```

---

## SLA Thresholds

These are enforced as k6 pass/fail thresholds. A non-zero exit code
from k6 means at least one threshold was breached.

| Metric | p50 | p95 | p99 | Notes |
|--------|-----|-----|-----|-------|
| `stellar_record_creation_duration` | < 3 s | < 8 s | < 15 s | Full REST + Stellar anchor round-trip |
| `http_req_failed` (rate) | – | < 5 % | – | HTTP 4xx/5xx |
| `stellar_error_rate` | – | < 5 % | – | Stellar-layer errors in response body |
| `http_req_duration` | – | < 10 s | – | Standard k6 HTTP metric |

> Thresholds are intentionally separate from the Stellar testnet's own latency
> (normally 3–5 s per ledger close). Adjust the `p(95)` value in
> `stellar-write.test.js` once you have baseline data.

---

## Custom metrics

| Metric name | Type | Description |
|---|---|---|
| `stellar_record_creation_duration` | Trend | Full end-to-end latency (ms) per `POST /medical-records` call |
| `stellar_submit_errors` | Counter | Cumulative count of Stellar-layer failures |
| `stellar_error_rate` | Rate | Fraction of requests that hit a Stellar error |

The `hasStellarError()` helper (in each test file) inspects both the HTTP status
code (5xx) and the JSON response body for keywords: `stellar`, `transaction`,
`anchor`, `soroban`, `sequence`, `submission`.

---

## CI integration

Add to `.github/workflows/load-test.yml` (runs on pull requests):

```yaml
name: Stellar write load-test (smoke)
on: [pull_request]

jobs:
  k6-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install -y k6

      - name: Start API stack
        run: docker compose -f docker-compose.local.yml up -d --wait

      - name: Obtain test JWT
        id: auth
        run: |
          TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
            -H 'Content-Type: application/json' \
            -d '{"email":"test@example.com","password":"testpassword"}' \
            | jq -r '.accessToken')
          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"

      - name: Run smoke test
        run: |
          k6 run \
            --env BASE_URL=http://localhost:3000 \
            --env AUTH_TOKEN=${{ steps.auth.outputs.token }} \
            load-tests/stellar-write/smoke.js
```

For full ramp/stress runs, trigger them manually or on a schedule rather than
on every PR to avoid burning Stellar testnet rate limits.

---

## Interpreting results

After a run, open `results/<scenario>-<timestamp>.json` in k6's web dashboard
or import it into Grafana (using the k6 InfluxDB output plugin).

Key things to look for:

- **`stellar_record_creation_duration` p95 creeping up** → Stellar submission
  queue depth is growing; consider adding workers or batching.
- **`stellar_error_rate` spiking** → sequence number collisions; NestJS
  Stellar service needs a proper sequence-number lock/retry strategy.
- **`http_req_duration` stable but `stellar_*` growing** → the REST layer is
  healthy but the async Stellar path is a bottleneck; consider decoupling
  anchoring into a background queue and returning a pending status to the client.