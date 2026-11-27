






import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  level: "info" | "warn" | "error" | "success";

  action?: ToastAction;
}

interface Props {
  items: Toast[];
  onDismiss: (id: string) => void;
  position: "top-center" | "bottom-right";
  tabbarVisible: boolean;
  statusbarVisible: boolean;
}

export function Toasts({ items, onDismiss, position, tabbarVisible, statusbarVisible }: Props) {



  const t = useT();
  if (!items.length) return null;

  return (
    <div
      className="toasts"
      data-position={position}
      data-tabbar={tabbarVisible ? "true" : "false"}
      data-statusbar={statusbarVisible ? "true" : "false"}
      role="status"
      aria-live="polite"
    >
      {


                                                      }
      {items.map((item5) => (
        <div key={item5.id} className={`toast toast-${item5.level}`}>
          <div className="toast-content">
            <span className="toast-message">{item5.message}</span>
            {item5.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  onDismiss(item5.id);
                  item5.action?.onClick();
                }}
              >
                {item5.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            className="toast-close"
            title={t("Dismiss")}
            aria-label={t("Dismiss this notification")}
            onClick={() => onDismiss(item5.id)}
          >
            <Icon name="nota-close-symbolic" />
          </button>
        </div>
      ))}
    </div>
  );
}
