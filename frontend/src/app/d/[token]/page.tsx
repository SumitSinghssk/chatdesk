import { SharedDiagram } from "@/app/(workspace)/dashboard/diagrams/_components/SharedDiagram";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedDiagram token={token} />;
}
