> 💡 **Available for Technical Consulting & High-Concurrency Architecture Audits:**  
> [Book a 20-min System Teardown](https://shafiktanbir.com/?tab=book) · [Explore Full Case Studies](https://shafiktanbir.com)

# ⚡ Sneaker-Drop-System — High-Concurrency Flash Sale Engine

[![Go](https://img.shields.io/badge/Go-1.22-blue.svg)](https://golang.org)
[![Redis](https://img.shields.io/badge/Redis-v7.2-red.svg)](https://redis.io)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> A production-grade distributed inventory reservation engine in Go built to process high-demand flash sales without stock overselling, race conditions, or database bottlenecks.

---

## 📐 Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as "User / Mobile App"
    participant GW as "API Gateway (Go HTTP Server)"
    participant Cache as "Redis Cluster (Atomic Lua Script)"
    participant WS as "WebSocket Stock Broadcast"
    participant DB as "PostgreSQL (Async Worker Persist)"

    Client->>GW: POST /api/v1/reserve (itemId, userId)
    GW->>Cache: EVALSHA reserveLuaScript (KEYS[1], KEYS[2], TTL=60s)
    alt Stock Available (> 0)
        Cache-->>GW: Return 1 (Stock Decremented & TTL Key Created)
        GW->>WS: Broadcast Live Stock Update
        GW-->>Client: 200 OK (Reservation Token, 60s Expiry)
    else User Duplicate Lock
        Cache-->>GW: Return -1
        GW-->>Client: 409 Conflict (Active Reservation Exists)
    else Stock Depleted (0)
        Cache-->>GW: Return 0
        GW-->>Client: 410 Gone (Sold Out)
    end
```

---

## 💡 Technical Challenges & Engineering Solutions

| Bottleneck / Challenge | Naive Approach | Go + Redis Lua Engineering Solution |
| --- | --- | --- |
| **Race Conditions / Stock Overselling** | `SELECT stock FROM items` followed by `UPDATE items SET stock = stock - 1` | **Atomic Lua Scripting**: Executes stock verification and decrement in single thread-safe Redis step. |
| **Database Connection Pool Exhaustion** | Synchronous Postgres writes per incoming HTTP request | **Async In-Memory Queue**: Reservations committed asynchronously with Redis TTL key expiration fallback. |
| **Real-Time Stock Propagation** | Polling HTTP `/stock` endpoint from frontend clients | **Gorilla WebSocket Hub**: Push-based push notifications on state changes. |

---

## 📊 k6 Load Test Benchmarking

Benchmarking executed on a single 4 vCPU / 8GB RAM Linux node:

* **Throughput Peak:** `10,450 Requests / Second (RPS)`
* **P95 Latency:** `14ms`
* **P99 Latency:** `38ms`
* **Oversell Rate:** **`0.00%`** across 50,000 requests testing 500 inventory units.

---

## 🛠️ Quickstart

```bash
# Clone repository
git clone https://github.com/shafiktanbir/Sneaker-Drop-System.git
cd Sneaker-Drop-System

# Start app & Redis with Docker Compose
docker compose up -d

# Test reservation request
curl -X POST http://localhost:8080/api/v1/reserve \
  -H "Content-Type: application/json" \
  -d '{"itemId": "sneaker-nike-v1", "userId": "usr_992"}'
```

---

> 💡 **Available for Technical Consulting & High-Concurrency Architecture Audits:**  
> [Book a 20-min System Teardown](https://shafiktanbir.com/?tab=book) · [Explore Full Case Studies](https://shafiktanbir.com)

