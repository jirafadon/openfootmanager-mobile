/**
 * MobileBottomNav.tsx
 *
 * On screens < 640px this renders the primary navigation as a fixed bottom bar.
 * On larger screens it renders nothing (the sidebar handles nav).
 *
 * Usage: mount this inside DashboardLayout alongside DashboardSidebar.
 * Pass the same `tabs` array used by DashboardSidebar.
 */
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";

export interface MobileNavTab {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

interface MobileBottomNavProps {
  tabs: MobileNavTab[];
}

export function MobileBottomNav({ tabs }: MobileBottomNavProps) {
  const { t } = useTranslation();

  // Limit to 5 tabs on mobile — pick the most important ones
  const mobileTabs = tabs.slice(0, 5);

  return (
    <nav
      aria-label="Bottom navigation"
      className="mobile-bottom-nav sm:hidden"
    >
      {mobileTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={tab.onClick}
            aria-current={tab.active ? "page" : undefined}
            className={`
              relative flex flex-col items-center justify-center gap-0.5
              flex-1 h-full px-1 text-[10px] font-medium transition-colors
              ${tab.active
                ? "text-primary-400"
                : "text-gray-400 hover:text-gray-200"}
            `}
          >
            <div className="relative nav-icon">
              <Icon className="w-6 h-6" />
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              ) : null}
            </div>
            <span className="nav-label">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
