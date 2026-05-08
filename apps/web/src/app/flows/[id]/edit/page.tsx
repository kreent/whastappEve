import { requireUser } from "@/lib/auth";
import Editor from "@/components/flow-editor/Editor";

export default async function FlowEditPage({ params }: { params: { id: string } }) {
  await requireUser();
  return <Editor flowId={params.id} />;
}
