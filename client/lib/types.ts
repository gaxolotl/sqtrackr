export type UserRef = {
  _id?: string;
  username: string;
  avatarUpdated?: number;
};

export type CommentRecord = {
  _id: string;
  comment: string;
  created: number;
  user?: UserRef;
  torrent?: { name: string; infoHash: string };
  announcement?: { title: string; slug: string };
  request?: { title: string; index: number };
};

export type TmdbMediaType = "movie" | "tv";

export type ParsedRelease = {
  releaseName: string;
  title: string;
  query: string;
  year?: number;
  season?: number;
  episodes: number[];
  episodeTitle?: string;
  mediaType?: TmdbMediaType;
};

export type TmdbCandidate = {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  originalTitle?: string;
  date?: string;
  year?: number;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  rating: number;
  voteCount: number;
  popularity: number;
  confidence: number;
  episodeTitle?: string;
  episodeMatch?: boolean;
};

export type TmdbIdentification = {
  parsed: ParsedRelease;
  candidates: TmdbCandidate[];
  autoMatchId?: number;
};

export type TorrentMetadata = {
  provider: "tmdb";
  id: number;
  mediaType: TmdbMediaType;
  imdbId?: string;
  title: string;
  originalTitle?: string;
  overview?: string;
  releaseDate?: string;
  year?: number;
  posterPath?: string;
  backdropPath?: string;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  runtime?: number;
  season?: number;
  episodes?: number[];
  episodeTitle?: string;
  confidence?: number;
};

export type Torrent = {
  _id?: string;
  infoHash: string;
  name: string;
  description?: string;
  type?: string;
  source?: string;
  poster?: string;
  uploadedBy?: UserRef;
  anonymous?: boolean;
  size?: number;
  files?: Array<{
    name?: string | number[] | { type?: string; data?: number[] };
    path?: string | number[] | { type?: string; data?: number[] };
    length?: number;
    size?: number;
  }>;
  created: number;
  downloads?: number;
  complete?: number;
  incomplete?: number;
  seeders?: number;
  leechers?: number;
  upvotes?: string[] | number;
  downvotes?: string[] | number;
  userHasUpvoted?: boolean;
  userHasDownvoted?: boolean;
  fetchedBy?: { bookmarked?: boolean };
  freeleech?: boolean;
  tags?: string[];
  mediaInfo?: string;
  comments?: CommentRecord[] | { count: number };
  groupTorrents?: Torrent[];
  tmdb?: TorrentMetadata;
};

export type TorrentSubmissionStatus =
  | "pending"
  | "approving"
  | "approved"
  | "rejected";

export type TorrentSubmission = {
  _id: string;
  infoHash: string;
  name: string;
  description?: string;
  type?: string;
  source?: string;
  poster?: string;
  uploadedBy?: UserRef;
  anonymous?: boolean;
  size?: number;
  files?: Torrent["files"];
  tags?: string[];
  groupWith?: string;
  mediaInfo?: string;
  tmdb?: TorrentMetadata;
  status: TorrentSubmissionStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: UserRef;
  rejectionReason?: string;
  torrent?: string;
  notifiedAt?: number;
};

export type TorrentSubmissionPage = {
  items: TorrentSubmission[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserProfile = {
  _id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  created: number;
  role: string;
  remainingInvites?: number;
  banned?: boolean;
  banReason?: string;
  bonusPoints?: number;
  ratio?: number;
  hitnruns?: number;
  snatches?: number;
  warnings?: UserWarning[];
  downloaded?: { bytes?: number; count?: number };
  uploaded?: { bytes?: number; count?: number };
  torrents?: Torrent[];
  comments?: CommentRecord[];
  totp?: { enabled?: boolean };
  bio?: string;
  location?: string;
  website?: string;
  avatarUpdated?: number;
};

export type Announcement = {
  _id: string;
  title: string;
  slug: string;
  body?: string;
  pinned?: boolean;
  allowComments?: boolean;
  created: number;
  updated?: number;
  createdBy?: UserRef;
  comments?: CommentRecord[];
};

export type TrackerRequest = {
  _id: string;
  index: number;
  title: string;
  body?: string;
  bounty?: number;
  topUps?: Array<{
    userId?: string;
    username?: string | null;
    amount: number;
    created: number;
  }>;
  created: number;
  createdBy?: UserRef;
  candidates?: Torrent[];
  fulfilledBy?: string | { torrent?: string };
  comments?: CommentRecord[];
};

export type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  link?: string;
  read?: boolean;
  created: number;
};

export type NotificationPage = {
  items: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type SavedSearch = {
  _id: string;
  name: string;
  query: string;
  created: number;
};

export type UserWarning = {
  _id: string;
  reason: string;
  issuedByUsername?: string | null;
  created: number;
  resolved?: boolean;
  resolvedAt?: number;
  appeal?: { text: string; created: number };
};

export type DashboardTorrent = {
  infoHash: string;
  name: string;
};

export type DashboardSnatch = DashboardTorrent & {
  snatchedAt: number;
  seedTime: number;
  uploaded: number;
  downloaded: number;
  pastGrace: boolean;
  ratioOk: boolean;
  seededEnough: boolean;
  isHnr: boolean;
  graceEndsAt: number;
};

export type DashboardData = {
  up: number;
  down: number;
  ratio: number;
  bp: number;
  hitnruns: number;
  snatches: number;
  seeding: DashboardTorrent[];
  leeching: DashboardTorrent[];
  warnings: DashboardSnatch[];
  currentHnrs: DashboardSnatch[];
  recentSnatches: DashboardSnatch[];
};

export type Report = {
  _id: string;
  reason: string;
  solved: boolean;
  solvedAt?: number;
  updated?: number;
  created: number;
  reportedBy?: UserRef;
  torrent?: Torrent;
};

export type TrackerStats = {
  registeredUsers: number;
  bannedUsers: number;
  uploadedTorrents: number;
  completedDownloads: number;
  totalInvitesSent: number;
  invitesAccepted: number;
  totalRequests: number;
  filledRequests: number;
  totalComments: number;
  activeTorrents: number;
  peers: number;
  seeders: number;
  leechers: number;
};

export type Invite = {
  _id: string;
  email: string;
  role: string;
  claimed: boolean;
  created: number;
  validUntil: number;
  token: string;
};

export type ContentLimits = {
  torrentName: number;
  title: number;
  body: number;
  comment: number;
  message: number;
  profileBio: number;
  profileLocation: number;
  mediaInfo: number;
  torrentTags: number;
  torrentFileSizeKb: number;
};

export type TrackerConfig = {
  siteName: string;
  siteDescription: string;
  showPageInTitle: boolean;
  contentCentered: boolean;
  contentMaxWidth: number;
  shortenMatchedTorrentNames: boolean;
  contentLimits: ContentLimits;
  allowRegister: "open" | "invite" | "closed";
  allowAnonymousUploads: boolean;
  torrentPremoderation: boolean;
  categories: Record<string, string[]>;
  siteWideFreeleech: boolean;
  allowUnregisteredView: boolean;
  defaultLocale: string;
  customTheme?: Record<string, string>;
  avatarMaxResolution: number;
  avatarMaxSizeKb: number;
  allowGifAvatars: boolean;
  attachmentsEnabled: boolean;
  attachmentMaxSizeKb: number;
  trackerUrl: string;
};

export type WikiPage = {
  _id?: string;
  slug: string;
  title: string;
  body?: string;
  public?: boolean;
  created?: number;
  createdBy?: UserRef;
};

export type WikiResponse = {
  page: WikiPage;
  allPages: Array<Pick<WikiPage, "slug" | "title">>;
};

export type ForumCategory = {
  _id: string;
  name: string;
  description?: string;
  sortOrder: number;
  icon?: string;
  created: number;
  threadCount?: number;
  postCount?: number;
  latestThread?:
    (Partial<ForumThread> & Pick<ForumThread, "_id" | "title">) | null;
};

export type ForumLastPost = {
  userId?: string;
  body: string;
  created: number;
  author?: UserRef | null;
};

export type ForumThread = {
  _id: string;
  category: ForumCategory | string;
  title: string;
  body?: string;
  createdBy?: string;
  author?: UserRef | null;
  created: number;
  updated: number;
  pinned: boolean;
  locked: boolean;
  views: number;
  postCount: number;
  lastPost?: ForumLastPost;
};

export type ForumPost = {
  _id: string;
  thread: string;
  userId?: string;
  author?: UserRef | null;
  body: string;
  created: number;
  edited?: number;
};

export type ForumThreadPage = {
  category: ForumCategory;
  total: number;
  page: number;
  pageSize: number;
  threads: ForumThread[];
};

export type ForumPostPage = {
  total: number;
  page: number;
  pageSize: number;
  posts: ForumPost[];
};

export type DirectMessage = {
  _id: string;
  sender: UserRef | null;
  body: string;
  created: number;
  readBy: string[];
  system?: boolean;
};

export type Conversation = {
  _id: string;
  participants: UserRef[];
  createdBy: string;
  created: number;
  subject?: string;
  system?: boolean;
  readOnly?: boolean;
  lastMessage?: {
    userId?: UserRef;
    body: string;
    created: number;
  } | null;
  unreadCount?: number;
};

export type ConversationPage = {
  total: number;
  page: number;
  pageSize: number;
  conversations: Conversation[];
};

export type DirectMessagePage = {
  total: number;
  page: number;
  pageSize: number;
  messages: DirectMessage[];
};
