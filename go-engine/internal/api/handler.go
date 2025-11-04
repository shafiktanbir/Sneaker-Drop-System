package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"sneaker-drop-system/internal/store"
	"sneaker-drop-system/internal/websocket"

	ws "github.com/gorilla/websocket"
)

type Handler struct {
	redisStore *store.RedisStore
	wsHub      *websocket.Hub
	upgrader   ws.Upgrader
}

func NewHandler(rStore *store.RedisStore, hub *websocket.Hub) *Handler {
	return &Handler{
		redisStore: rStore,
		wsHub:      hub,
		upgrader: ws.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

type ReserveRequest struct {
	ItemID string `json:"itemId"`
	UserID string `json:"userId"`
}

type ReserveResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Stock   int64  `json:"remainingStock,omitempty"`
}

func (h *Handler) HandleReserve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ReserveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ItemID == "" || req.UserID == "" {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	res, err := h.redisStore.ReserveStock(r.Context(), req.ItemID, req.UserID, 60)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ReserveResponse{Success: false, Message: "Server error: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if res == 1 {
		stock, _ := h.redisStore.GetStock(r.Context(), req.ItemID)
		h.wsHub.Broadcast([]byte(fmt.Sprintf(`{"itemId":"%s","stock":%d}`, req.ItemID, stock)))

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ReserveResponse{
			Success: true,
			Message: "Item reserved for 60 seconds",
			Stock:   stock,
		})
	} else if res == -1 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(ReserveResponse{Success: false, Message: "User already has an active reservation"})
	} else {
		w.WriteHeader(http.StatusGone)
		json.NewEncoder(w).Encode(ReserveResponse{Success: false, Message: "Flash sale sold out"})
	}
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	h.wsHub.Register(conn)
}
