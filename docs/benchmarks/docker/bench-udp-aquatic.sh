#!/usr/bin/env bash
set -e
source ~/.cargo/env
BENCH_DIR=~/aquatic-bench
LT=$BENCH_DIR/target/release/aquatic_udp_load_test
UDP=$BENCH_DIR/target/release/aquatic_udp
OUT=/tmp/udp-bench-results.txt
: > "$OUT"

mk_lt() {
  cat > "/tmp/lt-$1.toml" <<EOF
server_address = "127.0.0.1:$2"
log_level = "error"
workers = 4
duration = 15
summarize_last = 10
extra_statistics = true
[network]
multiple_client_ipv4s = true
sockets_per_worker = 4
recv_buffer = 8000000
[requests]
number_of_torrents = 200000
number_of_peers = 400000
scrape_max_torrents = 10
announce_peers_wanted = 30
weight_connect = 50
weight_announce = 50
weight_scrape = 1
peer_seeder_probability = 0.75
EOF
}

echo "=== aquatic_udp ===" | tee -a "$OUT"
cat > /tmp/aquatic-udp-bench.toml <<EOF
socket_workers = 4
log_level = "error"
[network]
use_ipv4 = true
use_ipv6 = false
address_ipv4 = "127.0.0.1:3100"
socket_recv_buffer_size = 8000000
EOF
mk_lt aquatic 3100
$UDP -c /tmp/aquatic-udp-bench.toml & UDP_PID=$!
sleep 2
$LT -c /tmp/lt-aquatic.toml 2>&1 | tee -a "$OUT"
kill $UDP_PID || true
wait $UDP_PID 2>/dev/null || true
sleep 2
echo "" | tee -a "$OUT"
echo "BENCH_DONE aquatic" | tee -a "$OUT"
