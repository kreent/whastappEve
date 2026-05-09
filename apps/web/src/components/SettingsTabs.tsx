"use client";

import { useState } from "react";
import clsx from "clsx";
import WhatsAppSettings from "./WhatsAppSettings";
import TelegramSettings from "./TelegramSettings";
import ComboPaySettings from "./ComboPaySettings";
import BusinessHoursSettings from "./BusinessHoursSettings";

const TABS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "combopay", label: "ComboPay" },
  { id: "hours", label: "Horario de atención" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsTabs() {
  const [tab, setTab] = useState<TabId>("whatsapp");
  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "text-sm px-4 py-2 border-b-2 -mb-px transition",
              tab === t.id
                ? "border-slate-900 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-w-2xl">
        {tab === "whatsapp" && <WhatsAppSettings />}
        {tab === "telegram" && <TelegramSettings />}
        {tab === "combopay" && <ComboPaySettings />}
        {tab === "hours" && <BusinessHoursSettings />}
      </div>
    </div>
  );
}
