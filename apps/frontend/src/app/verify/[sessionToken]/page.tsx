import { WorkerVerifyPage } from "@/pages-layer/worker-verify/WorkerVerifyPage";

export default async function VerifySessionPage({
  params,
}: {
  params: Promise<{ sessionToken: string }>;
}) {
  const { sessionToken } = await params;
  return <WorkerVerifyPage sessionToken={sessionToken} />;
}
