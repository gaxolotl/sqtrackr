import mongoose from "mongoose";
import fuzzySearch from "mongoose-fuzzy-searching";

const TmdbMetadata = new mongoose.Schema(
  {
    provider: { type: String, enum: ["tmdb"] },
    id: Number,
    mediaType: { type: String, enum: ["movie", "tv"] },
    imdbId: String,
    title: String,
    originalTitle: String,
    overview: String,
    releaseDate: String,
    year: Number,
    posterPath: String,
    backdropPath: String,
    genres: [String],
    rating: Number,
    voteCount: Number,
    runtime: Number,
    season: Number,
    episodes: [Number],
    episodeTitle: String,
    confidence: Number,
  },
  { _id: false },
);

const Torrent = new mongoose.Schema({
  infoHash: String,
  binary: String,
  poster: String,
  uploadedBy: mongoose.Schema.ObjectId,
  name: String,
  description: String,
  type: String,
  source: String,
  image: String,
  downloads: Number,
  anonymous: Boolean,
  size: Number,
  files: Array,
  created: Number,
  upvotes: Array,
  downvotes: Array,
  freeleech: Boolean,
  tags: Array,
  group: mongoose.Schema.ObjectId,
  confidenceScore: Number,
  mediaInfo: String,
  tmdb: { type: TmdbMetadata, default: undefined },
  submission: {
    type: mongoose.Schema.ObjectId,
    unique: true,
    sparse: true,
  },
});

Torrent.plugin(fuzzySearch, { fields: ["name"] });

export default mongoose.model("torrent", Torrent);
