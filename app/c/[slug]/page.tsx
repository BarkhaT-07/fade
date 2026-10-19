import { prisma } from "@/lib/db";
import CollectionClient from "./CollectionClient";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const exists = await prisma.collection.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  return <CollectionClient slug={params.slug} exists={Boolean(exists)} />;
}
