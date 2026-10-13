"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TorrentPeer = {
  peerId: string;
  ip: string;
  addresses: string[];
  seeder: boolean;
  username: string | null;
};

type PeersResponse = {
  infoHash: string;
  total: number;
  page: number;
  perPage: number;
  peers: TorrentPeer[];
};

const PAGE_SIZE = 10;

export function TorrentPeers({ infoHash }: { infoHash: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PeersResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    apiFetch<PeersResponse>(
      `/admin/torrent/${infoHash}/peers?page=${page}&perPage=${PAGE_SIZE}`,
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load peers.",
          );
      });
    return () => {
      active = false;
    };
  }, [open, page, infoHash]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setPage(1);
    setData(null);
    setError("");
    setOpen(true);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    setData(null);
    setError("");
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <button
        className="peer-toggle"
        type="button"
        aria-expanded={open}
        onClick={toggle}
      >
        <Upload aria-hidden="true" />
        <span>Peers</span>
        {data ? <span className="peer-count">({data.total})</span> : null}
        <ChevronDown aria-hidden="true" className="peer-chevron" />
      </button>

      {open ? (
        <div className="peers-panel">
          {error ? (
            <p className="peers-empty">{error}</p>
          ) : !data ? (
            <p className="peers-empty">Loading peers…</p>
          ) : data.peers.length === 0 ? (
            <p className="peers-empty">No peers are currently connected.</p>
          ) : (
            <>
              <ul className="peers-list">
                {data.peers.map((peer) => (
                  <li className="peer-row" key={peer.peerId}>
                    <span
                      className={
                        peer.seeder
                          ? "peer-state is-seeder"
                          : "peer-state is-leecher"
                      }
                    >
                      {peer.seeder ? (
                        <Upload aria-hidden="true" />
                      ) : (
                        <Download aria-hidden="true" />
                      )}
                      {peer.seeder ? "Seeder" : "Leecher"}
                    </span>
                    <span className="peer-main">
                      {peer.username ? (
                        <Link href={`/user/${encodeURIComponent(peer.username)}`}>
                          {peer.username}
                        </Link>
                      ) : (
                        <span className="peer-anon">Unregistered</span>
                      )}
                      <span className="peer-meta">
                        {peer.addresses.join(", ")} · {peer.peerId}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {totalPages > 1 ? (
                <div className="peer-pagination">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <ChevronLeft aria-hidden="true" /> Prev
                  </button>
                  <span>
                    Page {data?.page ?? page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
