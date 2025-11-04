package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"sneaker-drop-system/internal/api"
	"sneaker-drop-system/internal/store"
	"sneaker-drop-system/internal/websocket"
)

func main() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	redisStore := store.NewRedisStore(redisAddr)

	// Seed initial stock for demo flash sale item
	ctx := context.Background()
	if err := redisStore.SeedStock(ctx, "sneaker-nike-v1", 500); err != nil {
		log.Printf("Warning: Failed to seed Redis stock: %v", err)
	} else {
		log.Println("⚡ Seeded stock: 500 units of sneaker-nike-v1")
	}

	wsHub := websocket.NewHub()
	go wsHub.Run()

	h := api.NewHandler(redisStore, wsHub)

	http.HandleFunc("/api/v1/reserve", h.HandleReserve)
	http.HandleFunc("/ws/stock", h.HandleWebSocket)

	log.Printf("🚀 Sneaker-Drop-System Engine listening on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), nil); err != nil {
		log.Fatalf("Server shutdown: %v", err)
	}
}
