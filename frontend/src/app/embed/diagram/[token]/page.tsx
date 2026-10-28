import { EmbeddedDiagram } from "@/app/(workspace)/dashboard/diagrams/_components/EmbeddedDiagram";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EmbeddedDiagram token={token} />;
}
