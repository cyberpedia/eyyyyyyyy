export type EffectiveMap = Record<string, { user_rate?: string; ip_rate?: string }>;
export type DefaultsMap = Record<string, string>;
export type OverridesMap = Record<string, { user_rate: string; ip_rate: string }>;

export type DryRow = {
  scope: string;
  current_user_rate?: string;
  current_ip_rate?: string;
  new_user_rate?: string;
  new_ip_rate?: string;
  changed_user: boolean;
  changed_ip: boolean;
  user_direction: "up" | "down" | "same";
  ip_direction: "up" | "down" | "same";
  user_fallback: boolean;
  ip_fallback: boolean;
};

/**
 * Normalize a DRF throttle rate string to an equivalent tokens-per-minute number.
 * Supports sec|second|min|minute|hour|day.
 */
export function rateToPerMinute(rate?: string | null): number | undefined {
  if (!rate) return undefined;
  const m = rate.match(/^(\d+)\/(sec|second|min|minute|hour|day)$/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  switch (unit) {
    case "sec":
    case "second":
      return n * 60;
    case "min":
    case "minute":
      return n;
    case "hour":
      return n / 60;
    case "day":
      return n / (60 * 24);
    default:
      return undefined;
  }
}

/**
 * Compute dry-run rows comparing current effective rates and proposed overrides.
 * - Blank overrides fallback to defaults.
 * - Direction is computed by normalized tokens-per-minute comparison.
 */
export function computeDryRunRows(
  effective: EffectiveMap,
  defaults: DefaultsMap,
  overrides: OverridesMap
): DryRow[] {
  const rows: DryRow[] = [];
  for (const [scope, rates] of Object.entries(overrides)) {
    const current_user = effective[scope]?.user_rate ?? defaults[scope];
    const current_ip = effective[scope]?.ip_rate ?? defaults[`${scope}-ip`];

    const override_user_blank = (rates.user_rate ?? "") === "";
    const override_ip_blank = (rates.ip_rate ?? "") === "";

    const new_user = override_user_blank ? defaults[scope] : rates.user_rate;
    const new_ip = override_ip_blank ? defaults[`${scope}-ip`] : rates.ip_rate;

    const cur_user_pm = rateToPerMinute(current_user);
    const new_user_pm = rateToPerMinute(new_user);
    const cur_ip_pm = rateToPerMinute(current_ip);
    const new_ip_pm = rateToPerMinute(new_ip);

    const user_changed = (new_user ?? "") !== (current_user ?? "");
    const ip_changed = (new_ip ?? "") !== (current_ip ?? "");
    const user_dir: "up" | "down" | "same" =
      !user_changed || cur_user_pm === undefined || new_user_pm === undefined
        ? "same"
        : new_user_pm > cur_user_pm
        ? "up"
        : new_user_pm < cur_user_pm
        ? "down"
        : "same";
    const ip_dir: "up" | "down" | "same" =
      !ip_changed || cur_ip_pm === undefined || new_ip_pm === undefined
        ? "same"
        : new_ip_pm > cur_ip_pm
        ? "up"
        : new_ip_pm < cur_ip_pm
        ? "down"
        : "same";

    rows.push({
      scope,
      current_user_rate: current_user,
      current_ip_rate: current_ip,
      new_user_rate: new_user,
      new_ip_rate: new_ip,
      changed_user: user_changed,
      changed_ip: ip_changed,
      user_direction: user_dir,
      ip_direction: ip_dir,
      user_fallback: override_user_blank,
      ip_fallback: override_ip_blank,
    });
  }
  return rows;
}