package store

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisStore handles high-concurrency inventory reservations using Lua scripts.
type RedisStore struct {
	client *redis.Client
}

// NewRedisStore creates a new RedisStore with a connection pool tuned for high RPS.
func NewRedisStore(addr string) *RedisStore {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		PoolSize:     200,                // Connection pool tuned for high RPS
		MinIdleConns: 20,                 // Pre-warm connections
		DialTimeout:  2 * time.Second,
		ReadTimeout:  1 * time.Second,
		WriteTimeout: 1 * time.Second,
	})
	return &RedisStore{client: rdb}
}

// NewRedisStoreWithClient creates a RedisStore wrapping an existing go-redis Client.
func NewRedisStoreWithClient(client *redis.Client) *RedisStore {
	return &RedisStore{client: client}
}

// Client returns the underlying redis.Client.
func (r *RedisStore) Client() *redis.Client {
	return r.client
}

// Close closes the Redis client connection pool.
func (r *RedisStore) Close() error {
	if r.client != nil {
		return r.client.Close()
	}
	return nil
}

// --- Lua Scripts ---

// reserveLuaScript checks available stock and decrements atomically while setting a user lock.
// KEYS[1] = stock_key (e.g. item:sneaker-nike-v1:stock)
// KEYS[2] = reservation_key (e.g. item:sneaker-nike-v1:res:usr_123)
// KEYS[3] = expiry_zset_key (e.g. item:sneaker-nike-v1:expiries)
// ARGV[1] = TTL seconds (e.g. 60)
// ARGV[2] = current unix timestamp
// ARGV[3] = userId
// Returns:
//
//	 1  = success (reserved for TTL seconds)
//	 0  = out of stock
//	-1  = already has an active reservation
//	-2  = already checked out / confirmed
const reserveLuaScript = `
local res = redis.call("GET", KEYS[2])
if res then
    if res == "CONFIRMED" then
        return -2
    end
    return -1
end

local stock = tonumber(redis.call("GET", KEYS[1]) or "0")
if stock > 0 then
    redis.call("DECR", KEYS[1])
    redis.call("SETEX", KEYS[2], ARGV[1], "RESERVED")
    if KEYS[3] and ARGV[2] and ARGV[3] then
        local expireAt = tonumber(ARGV[2]) + tonumber(ARGV[1])
        redis.call("ZADD", KEYS[3], expireAt, ARGV[3])
    end
    return 1
else
    return 0
end
`

// releaseReservationLuaScript cancels an active reservation, restores stock, and clears user lock.
// KEYS[1] = stock_key (item:sneaker-nike-v1:stock)
// KEYS[2] = reservation_key (item:sneaker-nike-v1:res:usr_123)
// KEYS[3] = expiry_zset_key (item:sneaker-nike-v1:expiries)
// ARGV[1] = userId
// Returns:
//
//	 1  = successfully cancelled and stock incremented
//	 0  = reservation not found or expired
//	-1  = order already confirmed (cannot cancel)
const releaseReservationLuaScript = `
local res = redis.call("GET", KEYS[2])
if not res then
    return 0
end
if res == "CONFIRMED" then
    return -1
end
if res == "RESERVED" then
    redis.call("DEL", KEYS[2])
    redis.call("INCR", KEYS[1])
    if KEYS[3] and ARGV[1] then
        redis.call("ZREM", KEYS[3], ARGV[1])
    end
    return 1
end
return 0
`

// confirmOrderLuaScript transitions reservation from RESERVED to CONFIRMED.
// KEYS[1] = reservation_key (item:sneaker-nike-v1:res:usr_123)
// KEYS[2] = expiry_zset_key (item:sneaker-nike-v1:expiries)
// ARGV[1] = confirmed TTL seconds (e.g. 86400 to prevent re-reserving)
// ARGV[2] = userId
// Returns:
//
//	 1  = successfully confirmed
//	 0  = reservation expired or not found
//	-1  = already confirmed
const confirmOrderLuaScript = `
local res = redis.call("GET", KEYS[1])
if not res then
    return 0
end
if res == "CONFIRMED" then
    return -1
end
if res == "RESERVED" then
    redis.call("SETEX", KEYS[1], ARGV[1], "CONFIRMED")
    if KEYS[2] and ARGV[2] then
        redis.call("ZREM", KEYS[2], ARGV[2])
    end
    return 1
end
return 0
`

// sweepExpiredLuaScript scans the expiry ZSET, clears expired reservations, and restores stock.
// KEYS[1] = stock_key
// KEYS[2] = expiry_zset_key
// ARGV[1] = current unix timestamp
// ARGV[2] = res_prefix (e.g. "item:sneaker-nike-v1:res:")
// Returns: number of restored stock units.
const sweepExpiredLuaScript = `
local expiredUsers = redis.call("ZRANGEBYSCORE", KEYS[2], "-inf", ARGV[1])
local restored = 0
local prefix = ARGV[2]

for _, userId in ipairs(expiredUsers) do
    local resKey = prefix .. userId
    local status = redis.call("GET", resKey)
    if status ~= "CONFIRMED" then
        if status then
            redis.call("DEL", resKey)
        end
        redis.call("INCR", KEYS[1])
        restored = restored + 1
    end
    redis.call("ZREM", KEYS[2], userId)
end

return restored
`

// SeedStock sets the initial stock quantity for a flash sale item.
func (r *RedisStore) SeedStock(ctx context.Context, itemID string, quantity int) error {
	stockKey := fmt.Sprintf("item:%s:stock", itemID)
	expiryKey := fmt.Sprintf("item:%s:expiries", itemID)
	pipe := r.client.Pipeline()
	pipe.Set(ctx, stockKey, quantity, 0)
	pipe.Del(ctx, expiryKey)
	_, err := pipe.Exec(ctx)
	return err
}

// ReserveStock executes the atomic reservation Lua script.
// Returns:
//
//	 1 = reserved successfully
//	 0 = out of stock
//	-1 = duplicate active reservation
//	-2 = user already completed checkout
func (r *RedisStore) ReserveStock(ctx context.Context, itemID, userID string, ttlSeconds int) (int64, error) {
	stockKey := fmt.Sprintf("item:%s:stock", itemID)
	resKey := fmt.Sprintf("item:%s:res:%s", itemID, userID)
	expKey := fmt.Sprintf("item:%s:expiries", itemID)
	now := time.Now().Unix()

	script := redis.NewScript(reserveLuaScript)
	res, err := script.Run(ctx, r.client, []string{stockKey, resKey, expKey}, ttlSeconds, now, userID).Int64()
	if err != nil {
		return 0, err
	}
	return res, nil
}

// CancelReservation executes the atomic cancel Lua script to release reservation early.
// Returns:
//
//	 1 = cancelled & stock restored
//	 0 = reservation not found or expired
//	-1 = order already confirmed
func (r *RedisStore) CancelReservation(ctx context.Context, itemID, userID string) (int64, error) {
	stockKey := fmt.Sprintf("item:%s:stock", itemID)
	resKey := fmt.Sprintf("item:%s:res:%s", itemID, userID)
	expKey := fmt.Sprintf("item:%s:expiries", itemID)

	script := redis.NewScript(releaseReservationLuaScript)
	res, err := script.Run(ctx, r.client, []string{stockKey, resKey, expKey}, userID).Int64()
	if err != nil {
		return 0, err
	}
	return res, nil
}

// CheckoutReservation commits the reservation to CONFIRMED state.
// Returns:
//
//	 1 = checkout confirmed
//	 0 = reservation expired or not found
//	-1 = order already confirmed
func (r *RedisStore) CheckoutReservation(ctx context.Context, itemID, userID string) (int64, error) {
	resKey := fmt.Sprintf("item:%s:res:%s", itemID, userID)
	expKey := fmt.Sprintf("item:%s:expiries", itemID)
	confirmTTL := 86400 // 24 hours retention to block re-reserves

	script := redis.NewScript(confirmOrderLuaScript)
	res, err := script.Run(ctx, r.client, []string{resKey, expKey}, confirmTTL, userID).Int64()
	if err != nil {
		return 0, err
	}
	return res, nil
}

// SweepExpiredReservations scans for expired reservations and restores inventory.
func (r *RedisStore) SweepExpiredReservations(ctx context.Context, itemID string) (int64, error) {
	stockKey := fmt.Sprintf("item:%s:stock", itemID)
	expKey := fmt.Sprintf("item:%s:expiries", itemID)
	resPrefix := fmt.Sprintf("item:%s:res:", itemID)
	now := time.Now().Unix()

	script := redis.NewScript(sweepExpiredLuaScript)
	res, err := script.Run(ctx, r.client, []string{stockKey, expKey}, now, resPrefix).Int64()
	if err != nil {
		return 0, err
	}
	return res, nil
}

// GetStock returns the current available stock for an item.
func (r *RedisStore) GetStock(ctx context.Context, itemID string) (int64, error) {
	stockKey := fmt.Sprintf("item:%s:stock", itemID)
	val, err := r.client.Get(ctx, stockKey).Result()
	if err == redis.Nil {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(val, 10, 64)
}

// GetReservationStatus checks the status of a user's reservation.
func (r *RedisStore) GetReservationStatus(ctx context.Context, itemID, userID string) (string, time.Duration, error) {
	resKey := fmt.Sprintf("item:%s:res:%s", itemID, userID)
	val, err := r.client.Get(ctx, resKey).Result()
	if err == redis.Nil {
		return "", 0, nil
	}
	if err != nil {
		return "", 0, err
	}
	ttl, err := r.client.TTL(ctx, resKey).Result()
	if err != nil {
		return val, 0, err
	}
	return val, ttl, nil
}

// FlushDB clears the Redis test database.
func (r *RedisStore) FlushDB(ctx context.Context) error {
	return r.client.FlushDB(ctx).Err()
}
