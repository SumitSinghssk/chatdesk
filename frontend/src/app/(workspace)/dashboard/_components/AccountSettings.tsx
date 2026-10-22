"use client";

import { UserRoundCog } from "lucide-react";

import { ErrorBanner, PageHeader } from "@/app/admin/_components/ui/index";

import { DevicesCard, PasswordCard, PhoneCard, ProfileCard } from "./AccountCards";
import { useDashboard } from "./DashboardContext";

export function AccountSettings() {
  const { me, options, setMe } = useDashboard();
  return (
    <>
      <PageHeader
        icon={UserRoundCog}
        title="My account"
        description="Your profile, business name, password and signed-in devices."
      />
      <div className="grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-2">
        {!me.name && (
          <ErrorBanner className="xl:col-span-2" message="Add your name below so we know what to call you." />
        )}
        <ProfileCard me={me} onSaved={setMe} />
        <PhoneCard me={me} options={options} onSaved={setMe} />
        <PasswordCard me={me} onSaved={setMe} />
        <DevicesCard />
      </div>
    </>
  );
}
