import { create } from "zustand";
import { invoke } from "../bridge/invoke";

export interface AppSettings {
  theme: "dark" | "light" | "system";
  language: string;
  currency: "EUR" | "GBP" | "USD";
  default_match_mode: "live" | "spectator" | "delegate";
  auto_save: boolean;
  match_speed: "slow" | "normal" | "fast";
  show_match_commentary: boolean;
  confirm_advance: boolean;
  ui_scale: "small" | "normal" | "large" | "xlarge";
  high_contrast: boolean;
}

export interface CurrencyDefinition {
  code: AppSettings["currency"];
  symbol: string;
  exchange_rate: number;
}

interface SettingsResponse {
  settings: Partial<AppSettings>;
  currency: CurrencyDefinition;
  supported_currencies: CurrencyDefinition[];
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  language: "en",
  currency: "EUR",
  default_match_mode: "live",
  auto_save: true,
  match_speed: "normal",
  show_match_commentary: true,
  confirm_advance: false,
  ui_scale: "normal",
  high_contrast: false,
};

const DEFAULT_CURRENCY: CurrencyDefinition = {
  code: "EUR",
  symbol: "€",
  exchange_rate: 1,
};

function mergeWithDefaultSettings(settings: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function persistSettings(settings: AppSettings) {
  await invoke("save_settings", { settings });
}

function indexSupportedCurrencies(
  currencies: CurrencyDefinition[] = [],
): Record<string, CurrencyDefinition> {
  return currencies.reduce<Record<string, CurrencyDefinition>>((acc, currency) => {
    acc[currency.code] = currency;
    return acc;
  }, {});
}

interface SettingsStore {
  settings: AppSettings;
  currency: CurrencyDefinition;
  supportedCurrencies: Record<string, CurrencyDefinition>;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  currency: DEFAULT_CURRENCY,
  supportedCurrencies: { EUR: DEFAULT_CURRENCY },
  loaded: false,

  loadSettings: async () => {
    try {
      const response = await invoke<SettingsResponse>("get_settings");
      set({
        settings: mergeWithDefaultSettings(response.settings),
        currency: response.currency ?? DEFAULT_CURRENCY,
        supportedCurrencies: indexSupportedCurrencies(response.supported_currencies),
        loaded: true,
      });
    } catch {
      set({ settings: DEFAULT_SETTINGS, loaded: true });
    }
  },

  updateSettings: async (partial) => {
    const next = { ...get().settings, ...partial };
    set({ settings: next });
    await persistSettings(next);
  },
}));
