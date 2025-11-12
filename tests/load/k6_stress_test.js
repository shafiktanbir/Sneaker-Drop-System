import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 500 },  // Ramp up to 500 concurrent users
    { duration: '15s', target: 2000 }, // Spike to 2,000 users competing for stock
    { duration: '5s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<50'], // 95% of requests must complete below 50ms
  },
};

export default function () {
  const url = 'http://localhost:8080/api/v1/reserve';
  const payload = JSON.stringify({
    itemId: 'sneaker-nike-v1',
    userId: `user_${__VU}_${__ITER}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 200 or 409 or 410': (r) => [200, 409, 410].includes(r.status),
  });

  sleep(0.01);
}
