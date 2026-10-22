import { ArrowRight, CircleDashed } from "lucide-react";

import { Badge, Button, Card, CardBody, PageHeader } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { getModule, type ModuleKey } from "../_lib/nav";
import { CardHeader } from "./CardHeader";

/** Page for a workspace module that is on the roadmap but not built yet. */
export function ModulePage({ module: key }: { module: ModuleKey }) {
  const item = getModule(key);
  return (
    <>
      <PageHeader
        icon={item.icon}
        title={item.label}
        description={item.description}
        actions={item.phase && <Badge tone="warning">Coming in {item.phase}</Badge>}
      />
      <Card className="max-w-4xl">
        <CardHeader title="What this module will do" description="Planned in the build roadmap." />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2">
            {item.features?.map((feature) => (
              <li
                key={feature}
                className="border-line bg-page text-fg-muted flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
              >
                <CircleDashed size={16} className="text-fg-faint mt-0.5 shrink-0" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
          <div className="border-line mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-fg-subtle text-sm">
              Start by connecting your WhatsApp number. Everything else builds on it.
            </p>
            <Button href={CUSTOMER_ROUTES.WHATSAPP()} rightIcon={ArrowRight}>
              WhatsApp setup
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
