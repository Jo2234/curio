import { notFound } from "next/navigation";

import { SessionRoom } from "@/components/SessionControls";
import { loadPack } from "@/lib/packs";
import { getSessionState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = getSessionState(id);
  if (!state) notFound();

  const pack = loadPack(state.session.packId);
  return (
    <SessionRoom
      sessionId={id}
      pack={{
        title: pack.title,
        version: pack.version,
        verificationStatus: pack.verificationStatus,
        nodes: pack.nodes,
        misconceptions: pack.misconceptions,
      }}
    />
  );
}
