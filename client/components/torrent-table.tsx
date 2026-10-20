import Link from "next/link";
import { Download, List, MessageSquare, Upload } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Torrent } from "@/lib/types";
import { torrentDisplayName, torrentReleaseDetail } from "@/lib/torrents";
import { useI18n } from "@/components/i18n-context";
import { useTrackerConfig } from "@/hooks/use-tracker-config";

export type Comment = {
  id: string;
  context: string;
  date: string;
  body: string;
};

type TorrentTableProps = {
  torrents?: Torrent[];
};

function commentCount(comments: Torrent["comments"]) {
  if (Array.isArray(comments)) return comments.length;
  return comments?.count ?? 0;
}

export function TorrentTable({ torrents = [] }: TorrentTableProps) {
  const { t } = useI18n();
  const { config } = useTrackerConfig();
  return (
    <div className="table-wrap">
      <table className="torrent-table" aria-label={t("torrent")}>
        <thead>
          <tr>
            <th scope="col">{t("name")}</th>
            <th scope="col">{t("category")}</th>
            <th scope="col">{t("seeders")}</th>
            <th scope="col">{t("leechers")}</th>
            <th scope="col">{t("comments")}</th>
            <th scope="col">{t("uploaded")}</th>
          </tr>
        </thead>
        <tbody>
          {torrents.map((torrent) => {
            const displayName = torrentDisplayName(
              torrent,
              config.shortenMatchedTorrentNames,
            );
            const releaseDetail = config.shortenMatchedTorrentNames
              ? torrentReleaseDetail(torrent)
              : "";
            return (
              <tr key={torrent.infoHash}>
                <td data-label={t("name")}>
                  <span className="torrent-title-stack">
                    <Link
                      className="torrent-name"
                      href={`/torrent/${torrent.infoHash}`}
                      title={torrent.name}
                    >
                      {displayName}
                    </Link>
                    {releaseDetail ? <small>{releaseDetail}</small> : null}
                  </span>
                </td>
                <td data-label={t("category")}>
                  <span className="cell-with-icon">
                    <List aria-hidden="true" /> {torrent.type || t("all")}
                  </span>
                </td>
                <td data-label={t("seeders")}>
                  <span className="cell-with-icon">
                    <Upload aria-hidden="true" />{" "}
                    {torrent.seeders ?? torrent.complete ?? "?"}
                  </span>
                </td>
                <td data-label={t("leechers")}>
                  <span className="cell-with-icon">
                    <Download aria-hidden="true" />{" "}
                    {torrent.leechers ?? torrent.incomplete ?? "?"}
                  </span>
                </td>
                <td data-label={t("comments")}>
                  <span className="cell-with-icon">
                    <MessageSquare aria-hidden="true" />{" "}
                    {commentCount(torrent.comments)}
                  </span>
                </td>
                <td data-label={t("uploaded")}>
                  <time>{formatDate(torrent.created)}</time>
                </td>
              </tr>
            );
          })}
          {!torrents.length ? (
            <tr className="empty-row">
              <td colSpan={6}>{t("noTorrents")}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
