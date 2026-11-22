import type { PluginInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { parentItemRecordName, textItemName } from "@/ui/useSession";

interface Props {
  plugins: PluginInfo[];
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;

  recent: readonly string[];
  onOpenRecent: (path: string) => void;
}

export function Home({ plugins, onNew, onOpen, onOpenFolder, recent, onOpenRecent }: Props) {


  const t = useT();
  const failed = plugins.filter((p) => p.state === "failed");

  return (
    <div className="home">
      <div className="home-main">
        <h1 className="home-title">Nota</h1>
        <p className="home-lead">{t("A WYSIWYG Markdown editor")}</p>

        <div className="home-actions">
          <button type="button" className="home-action" onClick={onNew}>
            <span className="home-action-label">{t("New Document")}</span>
            <span className="home-action-hint">Ctrl+N</span>
          </button>
          <button type="button" className="home-action" onClick={onOpen}>
            <span className="home-action-label">{t("Open File")}</span>
            <span className="home-action-hint">Ctrl+O</span>
          </button>
          <button type="button" className="home-action" onClick={onOpenFolder}>
            <span className="home-action-label">{t("Open Folder")}</span>
            <span className="home-action-hint">{t("Use a whole folder as a workspace")}</span>
          </button>
        </div>

        {


                                       }
        {recent.length > 0 && (
          <section className="home-recent">
            <h2 className="home-recent-title">{t("Recently Opened")}</h2>
            <ul className="home-recent-list">
              {recent.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    className="home-recent-item"
                    title={path}
                    onClick={() => onOpenRecent(path)}
                  >
                    <span className="home-recent-name">{textItemName(path)}</span>
                    <span className="home-recent-dir">{parentItemRecordName(path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="home-side">
        <h2 className="home-side-title">{t("Extensions")}</h2>
        {plugins.length === 0 ? (
          <p className="home-hint">{t("No extensions found.")}</p>
        ) : (
          <ul className="home-plugins">
            {plugins.map((p) => (
              <li key={p.id} className={`home-plugin home-plugin-${p.state}`}>
                <span className="home-plugin-name">{p.name}</span>
                <span className="home-plugin-state">
                  {p.state === "loaded"
                    ? t("Loaded")
                    : p.state === "disabled"
                      ? t("Disabled")
                      : t("Failed")}
                </span>
              </li>
            ))}
          </ul>
        )}


        {failed.length > 0 && (
          <p className="home-warn">
            {t("{0} extensions failed to load. See the “Extensions” dock on the right for details.", failed.length)}
          </p>
        )}
      </aside>
    </div>
  );
}
