import { redirect } from "next/navigation";

// Learner activity now lives on the learner profile page.
export default async function LearnerActivityRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/learners/${id}#activity`);
}
