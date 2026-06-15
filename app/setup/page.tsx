import type { Metadata } from "next";

import { listPacks } from "@/lib/packs";

import SetupForm from "./SetupForm";

export const metadata: Metadata = {
  title: "Set up a session",
  description: "Choose a lesson pack and begin teaching Curio in under thirty seconds.",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const query = await searchParams;
  const mode = query.mode === "student" ? "student" : "teacher";
  const packs = listPacks().map(({ id, title, subject, level, version, verificationStatus }) => ({
    id,
    title,
    subject,
    level,
    version,
    verificationStatus,
  }));

  return <SetupForm packs={packs} initialMode={mode} />;
}
