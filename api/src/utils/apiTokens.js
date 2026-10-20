// Personal API tokens are full account credentials. Cap their lifetime so a
// leaked token cannot stay valid forever even if it is never revoked.
export const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Tokens created before expiry tracking was introduced are capped at 90 days
// from their creation timestamp. A token with no timestamps at all is treated
// as expired, forcing the owner to mint a new one.
export const getApiTokenExpiry = (token) => {
  if (typeof token?.expiresAt === "number") return token.expiresAt;
  if (typeof token?.created === "number") {
    return token.created + API_TOKEN_TTL_MS;
  }
  return 0;
};
