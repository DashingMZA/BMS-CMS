import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import Header from "@/components/admin/Header";
import TagEditor from "@/components/admin/TagEditor";
import { numericId } from "@/lib/routeParams";

export default async function EditTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = numericId(id);
  if (numId === null) notFound();

  const tag = await db.query.tags.findFirst({ where: eq(tags.id, numId) });
  if (!tag) notFound();

  return (
    <>
      <Header title={tag.name} />
      <main className="flex-1 p-6">
        <TagEditor tag={tag} />
      </main>
    </>
  );
}
