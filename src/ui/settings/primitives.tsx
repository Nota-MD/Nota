











































import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";


const QueryContext = createContext("");


const GroupContext = createContext("");

export const QueryProvider = QueryContext.Provider;

export const useQuery = () => useContext(QueryContext);


export function hits(query: string, label: string, description?: string): boolean {
  if (!query) return true;
  return `${label} ${description ?? ""}`.toLowerCase().includes(query);
}











function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}












const LABELABLE_TAGS = new Set(["input", "textarea"]);











export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  ...rest
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "value" | "onChange" | "children" | "onClick" | "onKeyDown" | "type" | "role"
>) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [popupPlace, setPopupPlace] = useState<CSSProperties | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const activeOption = options[activeIndex];
  const optionId = (index: number) => `${id}-option-${index}`;

  const placePopup = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const viewportGap = 8;
    const probe = document.createElement("span");
    const triggerStyle = getComputedStyle(trigger);
    probe.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;visibility:hidden;white-space:nowrap;";
    probe.style.font = triggerStyle.font;
    probe.style.letterSpacing = triggerStyle.letterSpacing;
    probe.textContent = options.reduce(
      (longest, option) =>
        option.label.length > longest.length ? option.label : longest,
      "",
    );
    document.body.append(probe);
    const contentWidth = probe.getBoundingClientRect().width + 44;
    probe.remove();
    const width = Math.min(
      Math.max(box.width, contentWidth, 180),
      Math.max(0, window.innerWidth - viewportGap * 2),
    );
    const left = Math.min(
      Math.max(viewportGap, box.left),
      Math.max(viewportGap, window.innerWidth - width - viewportGap),
    );
    const below = window.innerHeight - box.bottom;
    const above = box.top;
    const openAbove = below < 220 && above > below;
    setPopupPlace(
      openAbove
        ? { left, width, bottom: window.innerHeight - box.top + 4 }
        : { left, width, top: box.bottom + 4 },
    );
  }, [options]);

  useLayoutEffect(() => {
    if (!open) return;
    placePopup();
    window.addEventListener("resize", placePopup);
    return () => window.removeEventListener("resize", placePopup);
  }, [open, placePopup]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, options.length - 1)));
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const popup = popupRef.current;
    const active = popup?.querySelector<HTMLElement>('[data-active="true"]');
    if (!popup || !active) return;
    const popupBox = popup.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.top < popupBox.top) popup.scrollTop -= popupBox.top - activeBox.top;
    else if (activeBox.bottom > popupBox.bottom) {
      popup.scrollTop += activeBox.bottom - popupBox.bottom;
    }
  }, [open, activeIndex]);

  const showAt = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (step: number) => {
    if (options.length === 0) return;
    setActiveIndex((current) => (current + step + options.length) % options.length);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showAt(selectedIndex >= 0 ? selectedIndex : 0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        showAt(selectedIndex >= 0 ? selectedIndex : options.length - 1);
        return;
      }
    } else {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(0, options.length - 1));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(activeIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        return;
      }
    }

    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      options.length > 0
    ) {
      const now = Date.now();
      const previous = typeaheadRef.current;
      const query = now - previous.at > 600 ? event.key : previous.text + event.key;
      typeaheadRef.current = { text: query, at: now };
      const start = open ? activeIndex + 1 : Math.max(0, selectedIndex);
      const found = options.findIndex((_, index) => {
        const wrapped = (start + index) % options.length;
        return options[wrapped]?.label.toLowerCase().startsWith(query.toLowerCase());
      });
      if (found >= 0) {
        event.preventDefault();
        const target = (start + found) % options.length;
        if (open) setActiveIndex(target);
        else showAt(target);
      }
    }
  };

  return (
    <span className="stg-select" data-open={open ? "true" : undefined}>
      <button
        {...rest}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeOption ? optionId(activeIndex) : undefined}
        className={`stg-select-trigger${className ? ` ${className}` : ""}`}
        onClick={() => {
          if (open) setOpen(false);
          else showAt(selectedIndex >= 0 ? selectedIndex : 0);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="stg-select-value">
          {options.find((option) => option.value === value)?.label ?? ""}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            id={listboxId}
            role="listbox"
            className="stg-select-popup"
            style={popupPlace ?? { visibility: "hidden" }}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                className="stg-select-option"
                data-active={index === activeIndex ? "true" : undefined}
                aria-selected={option.value === value}
                onPointerEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}









export function Toggle({
  checked,
  onChange,
  ...rest
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
} & Omit<ComponentPropsWithoutRef<"button">, "onChange" | "children">) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      className="stg-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="stg-switch-knob" />
    </button>
  );
}









export function Radio<T extends string>({
  value,
  options,
  onChange,
  name,
  ...rest
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;

  name?: string;
} & Omit<ComponentPropsWithoutRef<"span">, "onChange" | "children">) {
  const auto = useId();
  const group = name ?? auto;

  return (
    <span {...rest} className="stg-radio" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="stg-radio-item">
          <input
            type="radio"
            name={group}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </span>
  );
}





export function TextInput({
  value,
  onChange,
  width = "md",
  secret = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  width?: "sm" | "md" | "lg";






  secret?: boolean;
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {
  return (
    <input
      {...rest}
      type={secret ? "password" : "text"}
      className={`stg-input stg-input-${width}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}













export function TextArea({
  value,
  onChange,
  rows = 4,
  mono = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;

  rows?: number;

  mono?: boolean;
} & Omit<
  ComponentPropsWithoutRef<"textarea">,
  "value" | "onChange" | "children" | "rows"
>) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={`stg-input stg-textarea${mono ? " stg-textarea-mono" : ""}`}
      value={value}


      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}





export function NumberInput({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  ...rest
}: {
  value: number;
  min: number;
  max: number;
  step?: number;

  suffix?: string;
  onChange: (value: number) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {





  //



  //


  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Number(draft);

    if (draft.trim() === "" || !Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <span className="stg-number">
      <input
        {...rest}
        type="number"
        className="stg-input stg-input-num"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          commit();
          e.currentTarget.blur();
        }}
      />
      {suffix && <span className="stg-number-suffix">{suffix}</span>}
    </span>
  );
}


export function Range({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  ...rest
}: {
  value: number;
  min: number;
  max: number;
  step?: number;

  suffix?: string;
  onChange: (value: number) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "children">) {
  return (
    <span className="stg-range">
      <input
        {...rest}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <span className="stg-range-value">
        {value}
        {suffix}
      </span>
    </span>
  );
}








export function ActionButton({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;

  title?: string;







  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? "btn stg-action stg-action-danger" : "btn stg-action"}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}


















export function HelpDot({ text }: { text: ReactNode }) {

  const t = useT();
  const id = useId();
  return (
    <span className="stg-help">
      <button type="button" className="stg-help-dot" aria-describedby={id} aria-label={t("Description")}>
        ?
      </button>
      <span id={id} role="tooltip" className="stg-help-pop">
        {text}
      </span>
    </span>
  );
}




const OWN_CONTROLS: unknown[] = [
  Toggle,
  Select,
  Range,
  Radio,
  TextInput,
  NumberInput,
  TextArea,
];















export function SettingRow({
  label,
  description,
  searchText,
  help,
  layout = "columns",
  children,
}: {

  label?: string;




  description?: ReactNode;



  searchText?: string;




  help?: ReactNode;
  layout?: "columns" | "stacked";
  children: ReactNode;
}) {
  const query = useQuery();
  const group = useContext(GroupContext);
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  const descText = typeof description === "string" ? description : undefined;
  const childEl = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;

  const labelable =
    childEl !== null &&
    (typeof childEl.type !== "string"
      ? OWN_CONTROLS.some((c) => c === childEl.type)
      : LABELABLE_TAGS.has(childEl.type));


  if (!hits(query, [group, label, descText, searchText].filter(Boolean).join(" "))) return null;





  const control =
    childEl === null
      ? children
      : cloneElement(childEl, {
          id,
          ...(label !== undefined
            ? { "aria-labelledby": labelId }
            : group
              ? { "aria-label": group }
              : {}),
          ...(descText ? { "aria-describedby": descId } : {}),
        });

  return (
    <div
      className="stg-row"
      data-flat={label === undefined ? "true" : undefined}
      data-layout={layout}
    >
      <div className="stg-row-text">
        {label !== undefined &&
          (labelable ? (
            <label id={labelId} className="stg-row-label" htmlFor={id}>
              {label}
            </label>
          ) : (
            <span id={labelId} className="stg-row-label">
              {label}
            </span>
          ))}
        {help && <HelpDot text={help} />}
        {description && (
          <span id={descId} className="stg-row-desc">
            {description}
          </span>
        )}
      </div>
      <div className="stg-row-control">{control}</div>
    </div>
  );
}











export function SettingsGroup({
  title,
  description,
  help,
  children,
}: {
  title: string;

  description?: ReactNode;

  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="stg-group">
      <div className="stg-group-head">
        <h3 className="stg-group-title">{title}</h3>
        {help && <HelpDot text={help} />}
      </div>
      {description && <p className="stg-group-desc">{description}</p>}
      <GroupContext.Provider value={title}>
        <div className="stg-group-body">{children}</div>
      </GroupContext.Provider>
    </section>
  );
}













export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {

  const t = useT();
  return (
    <span className="stg-search-wrap">
      <input
        type="search"
        className="stg-search"
        value={value}
        placeholder={t("Search settings…")}
        aria-label={t("Search settings")}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" && (
        <button
          type="button"
          className="stg-search-clear"
          aria-label={t("Clear the search")}
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </span>
  );
}


export function Value({ children }: { children: ReactNode }) {
  return <span className="stg-value">{children}</span>;
}














export function Note({ children }: { children: ReactNode }) {
  const query = useQuery();
  if (!hits(query, nodeText(children))) return null;
  return <p className="stg-note">{children}</p>;
}
