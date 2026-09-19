export const shouldPremoderateUpload = ({ enabled, role }) =>
  enabled === true && role !== "staff" && role !== "admin";
