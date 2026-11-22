





































import { useCallback, useEffect, useMemo, useState } from "react";

import type { Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { accelSig, accelToText, eventAccel, formatAccel, parseAccel } from "@/ui/accel";
import { walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { isRecentItem } from "@/ui/recentMenu";
import { ActionButton, SettingRow, SettingsGroup } from "../primitives";

interface Props {

  menus: readonly MenuSpec[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

interface Shortcut {
  id: string;
  label: string;

  accel?: string;
}


function bindable(item: MenuItemSpec): boolean {
  if (item.submenu) return false;
  if (item.id.startsWith("__")) return false;
  return !isRecentItem(item.id);
}











function pressMenuGroup(menus: readonly MenuSpec[]): Array<{ menu: MenuSpec; items: Shortcut[] }> {
  const groups: Array<{ menu: MenuSpec; items: Shortcut[] }> = [];

  for (const menu of menus) {
    const items: Shortcut[] = [];
    walkMenuItems([menu], (item: MenuItemSpec) => {
      if (!bindable(item)) return;
      items.push({ id: item.id, label: item.label, accel: item.accel });
    });
    if (items.length) groups.push({ menu, items });
  }

  return groups;
}

export function ShortcutsPane({ menus, settings, onChange }: Props) {


  const t = useT();


  const coverCover = settings?.keys?.overrides ?? {};


  const [recordMakeMiddle, setRecordMakeMiddle] = useState<string | null>(null);

  const [collideCar, setCollideCar] = useState<{ id: string; copy2: string } | null>(null);



  const group = useMemo(() => pressMenuGroup(menus), [menus]);







  const keyPositionReturnBelong = useMemo(() => {
    const m = new Map<string, Shortcut>();
    for (const g of group) {
      for (const s of g.items) {
        const a = s.accel ? parseAccel(s.accel) : null;
        if (a) m.set(accelSig(a), s);
      }
    }
    return m;
  }, [group]);


  const write = useCallback(
    (fill: Record<string, string>) => {
      onChange({ keys: { overrides: { ...coverCover, ...fill } } });
    },
    [onChange, coverCover],
  );












  useEffect(() => {
    if (!recordMakeMiddle) return;
    const id = recordMakeMiddle;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordMakeMiddle(null);
        setCollideCar(null);
        return;
      }

      const a = eventAccel(e);
      const text2 = accelToText(a);



      if (!text2) return;

      const collide = keyPositionReturnBelong.get(accelSig(a));
      if (collide && collide.id !== id) {
        setCollideCar({
          id,
          copy2: t("That binding belongs to “{0}”. Clear it there first if you want this command to have it.", t(collide.label)),
        });
        return;
      }

      setRecordMakeMiddle(null);
      setCollideCar(null);
      write({ [id]: text2 });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordMakeMiddle, keyPositionReturnBelong, write, t]);


  const changePass = (id: string) => id in coverCover;

  return (
    <div className="stg-shortcuts">
      {group.map(({ menu, items }) => (
        <SettingsGroup key={menu.id} title={t(menu.label)}>
          {items.map((s) => (
            <SettingRow
              key={s.id}
              label={t(s.label)}






              searchText={[s.accel, changePass(s.id) ? t("changed") : ""].filter(Boolean).join(" ")}
              description={
                collideCar?.id === s.id ? <span className="stg-keys-clash">{collideCar.copy2}</span> : undefined
              }
            >
              <span className="stg-keys-cell">
                <span className="stg-keys-value">
                  {recordMakeMiddle === s.id ? (

                    <kbd className="stg-kbd stg-kbd-rec">{t("Press the new keys…")}</kbd>
                  ) : s.accel ? (
                    <kbd className="stg-kbd">{formatAccel(s.accel)}</kbd>
                  ) : (
                    <span className="stg-keys-none">{t("Not set")}</span>
                  )}
                </span>
                <span className="stg-keys-actions">
                  <ActionButton
                    onClick={() => {
                      setCollideCar(null);
                      setRecordMakeMiddle(recordMakeMiddle === s.id ? null : s.id);
                    }}
                    title={t("Press the keys you want to use; press Esc to cancel")}
                  >
                    {recordMakeMiddle === s.id ? t("Cancel") : t("Change")}
                  </ActionButton>
                  {s.accel && (
                    <ActionButton onClick={() => write({ [s.id]: "" })} title={t("No shortcut for this command")}>
                      {t("Clear")}
                    </ActionButton>
                  )}
                  {changePass(s.id) && (
                    <ActionButton
                      onClick={() => {
                        const newValue = { ...coverCover };
                        delete newValue[s.id];
                        onChange({ keys: { overrides: newValue } });
                      }}
                      title={t("Reset this one to its factory binding (or to none, if it never had one)")}
                    >
                      {t("Reset")}
                    </ActionButton>
                  )}
                </span>
              </span>
            </SettingRow>
          ))}
        </SettingsGroup>
      ))}

      {






                                                 }
      {
                                   }
      {Object.keys(coverCover).length > 0 && (
        <div className="stg-keys-reset-all">
          <ActionButton onClick={() => onChange({ keys: { overrides: {} } })}>
            {t("Reset all")}
          </ActionButton>
          <span className="stg-keys-hint">
            {t("{0} changed. After resetting, every binding follows the factory defaults in commands.ts.", Object.keys(coverCover).length)}
          </span>
        </div>
      )}
    </div>
  );
}
