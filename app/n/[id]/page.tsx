import { getNoteInfo } from "@/lib/notes";
import NoteClient from "./NoteClient";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: { id: string } }) {
  const info = await getNoteInfo(params.id);
  return <NoteClient id={params.id} initialScreen={info.screen} initialViewsLeft={info.viewsLeft} />;
}
