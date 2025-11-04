package store

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func getTestStore(t *testing.T) *RedisStore {
	store := NewRedisStore("localhost:6379")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := store.Client().Ping(ctx).Err(); err != nil {
		t.Skipf("Skipping Redis integration test: Redis not accessible at localhost:6379: %v", err)
	}

	_ = store.FlushDB(ctx)
	return store
}

func TestRedisStore_Lifecycle(t *testing.T) {
	s := getTestStore(t)
	defer s.Close()

	ctx := context.Background()
	itemID := "test-sneaker-01"

	// 1. Seed stock = 2
	if err := s.SeedStock(ctx, itemID, 2); err != nil {
		t.Fatalf("Failed to seed stock: %v", err)
	}

	stock, err := s.GetStock(ctx, itemID)
	if err != nil || stock != 2 {
		t.Fatalf("Expected stock 2, got %d (err: %v)", stock, err)
	}

	// 2. Reserve user 1 (Success)
	res1, err := s.ReserveStock(ctx, itemID, "user_1", 60)
	if err != nil || res1 != 1 {
		t.Fatalf("Expected res1=1, got %d (err: %v)", res1, err)
	}

	// Stock should be 1
	stock, _ = s.GetStock(ctx, itemID)
	if stock != 1 {
		t.Fatalf("Expected stock 1, got %d", stock)
	}

	// 3. User 1 tries to reserve again -> duplicate lock (-1)
	resDup, err := s.ReserveStock(ctx, itemID, "user_1", 60)
	if err != nil || resDup != -1 {
		t.Fatalf("Expected resDup=-1, got %d (err: %v)", resDup, err)
	}

	// 4. Reserve user 2 (Success)
	res2, err := s.ReserveStock(ctx, itemID, "user_2", 60)
	if err != nil || res2 != 1 {
		t.Fatalf("Expected res2=1, got %d (err: %v)", res2, err)
	}

	// Stock should be 0
	stock, _ = s.GetStock(ctx, itemID)
	if stock != 0 {
		t.Fatalf("Expected stock 0, got %d", stock)
	}

	// 5. User 3 tries to reserve -> Out of stock (0)
	res3, err := s.ReserveStock(ctx, itemID, "user_3", 60)
	if err != nil || res3 != 0 {
		t.Fatalf("Expected res3=0, got %d (err: %v)", res3, err)
	}

	// 6. User 2 cancels reservation -> stock restored to 1
	cancelRes, err := s.CancelReservation(ctx, itemID, "user_2")
	if err != nil || cancelRes != 1 {
		t.Fatalf("Expected cancelRes=1, got %d (err: %v)", cancelRes, err)
	}

	stock, _ = s.GetStock(ctx, itemID)
	if stock != 1 {
		t.Fatalf("Expected stock restored to 1, got %d", stock)
	}

	// 7. User 3 can now reserve the returned unit
	res3Retry, err := s.ReserveStock(ctx, itemID, "user_3", 60)
	if err != nil || res3Retry != 1 {
		t.Fatalf("Expected res3Retry=1, got %d (err: %v)", res3Retry, err)
	}

	// 8. User 1 checks out (commits reservation)
	checkoutRes, err := s.CheckoutReservation(ctx, itemID, "user_1")
	if err != nil || checkoutRes != 1 {
		t.Fatalf("Expected checkoutRes=1, got %d (err: %v)", checkoutRes, err)
	}

	// User 1 cannot cancel after checkout (-1)
	cancelAfterCheckout, err := s.CancelReservation(ctx, itemID, "user_1")
	if err != nil || cancelAfterCheckout != -1 {
		t.Fatalf("Expected cancelAfterCheckout=-1, got %d (err: %v)", cancelAfterCheckout, err)
	}

	// User 1 cannot re-reserve after checkout (-2)
	reReserve, err := s.ReserveStock(ctx, itemID, "user_1", 60)
	if err != nil || reReserve != -2 {
		t.Fatalf("Expected reReserve=-2, got %d (err: %v)", reReserve, err)
	}
}

func TestRedisStore_ExpirationSweep(t *testing.T) {
	s := getTestStore(t)
	defer s.Close()

	ctx := context.Background()
	itemID := "test-sneaker-sweep"

	// Seed stock = 1
	_ = s.SeedStock(ctx, itemID, 1)

	// Reserve with 1s TTL
	res, err := s.ReserveStock(ctx, itemID, "user_exp", 1)
	if err != nil || res != 1 {
		t.Fatalf("Expected reserve success, got %d (err: %v)", res, err)
	}

	stock, _ := s.GetStock(ctx, itemID)
	if stock != 0 {
		t.Fatalf("Expected stock 0, got %d", stock)
	}

	// Wait 1.5 seconds for TTL to elapse
	time.Sleep(1500 * time.Millisecond)

	// Run sweep
	restored, err := s.SweepExpiredReservations(ctx, itemID)
	if err != nil {
		t.Fatalf("Sweep error: %v", err)
	}
	if restored != 1 {
		t.Fatalf("Expected 1 restored unit, got %d", restored)
	}

	// Stock restored to 1
	stock, _ = s.GetStock(ctx, itemID)
	if stock != 1 {
		t.Fatalf("Expected stock restored to 1, got %d", stock)
	}
}

func TestRedisStore_HighConcurrency_ZeroOversell(t *testing.T) {
	s := getTestStore(t)
	defer s.Close()

	ctx := context.Background()
	itemID := "test-sneaker-concurrency"
	initialStock := 50
	totalUsers := 200

	if err := s.SeedStock(ctx, itemID, initialStock); err != nil {
		t.Fatalf("Failed to seed stock: %v", err)
	}

	var successfulReservations int64
	var outOfStockCount int64
	var wg sync.WaitGroup

	startBarrier := make(chan struct{})

	for i := 0; i < totalUsers; i++ {
		wg.Add(1)
		userID := fmt.Sprintf("concurrent_usr_%d", i)
		go func(uid string) {
			defer wg.Done()
			<-startBarrier // synchronize start

			res, err := s.ReserveStock(ctx, itemID, uid, 60)
			if err != nil {
				t.Errorf("Error during reserve: %v", err)
				return
			}
			if res == 1 {
				atomic.AddInt64(&successfulReservations, 1)
			} else if res == 0 {
				atomic.AddInt64(&outOfStockCount, 1)
			}
		}(userID)
	}

	// Release all goroutines simultaneously
	close(startBarrier)
	wg.Wait()

	remainingStock, err := s.GetStock(ctx, itemID)
	if err != nil {
		t.Fatalf("GetStock error: %v", err)
	}

	t.Logf("Successful reservations: %d", successfulReservations)
	t.Logf("Out of stock responses: %d", outOfStockCount)
	t.Logf("Remaining stock in Redis: %d", remainingStock)

	if successfulReservations != int64(initialStock) {
		t.Fatalf("CRITICAL OVERSELL/UNDERSELL: Expected exactly %d successes, got %d", initialStock, successfulReservations)
	}
	if remainingStock != 0 {
		t.Fatalf("Expected 0 remaining stock, got %d", remainingStock)
	}
	if outOfStockCount != int64(totalUsers-initialStock) {
		t.Fatalf("Expected %d out-of-stock responses, got %d", totalUsers-initialStock, outOfStockCount)
	}
}
