import { UploadModerationDetail } from "@/components/upload-moderation-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UploadModerationDetail id={id} />;
}
