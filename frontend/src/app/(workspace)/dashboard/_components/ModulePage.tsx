import { ArrowRight, CircleDashed } from "lucide-react";

import { Badge, Button, Card, CardBody } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { getModule, type ModuleKey } from "../_lib/nav";
import { CardHeader } from "./CardHeader";

/** Page for a workspace module that is on the roadmap but not built yet. */
export function ModulePage({ module: key }: { module: ModuleKey }) {
  const item = getModule(key);
  return (
    <>
      <h1 className="sr-only">{item.label}</h1>
      <Card>
        <div className="border-line flex flex-wrap items-start gap-3 border-b p-4 sm:p-5">
          <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <item.icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-fg font-semibold">{item.label}</p>
            <p className="text-fg-subtle text-sm">{item.description}</p>
          </div>
          {item.phase && <Badge tone="warning">Coming in {item.phase}</Badge>}
        </div>
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
