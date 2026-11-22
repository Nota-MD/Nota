


























import { t } from "@/i18n";

import { languageIcon, hasDedicatedBelongIcon } from "./lang-icon";


const NO_LANGUAGE = "";


function plainText(): string {


  return t("Plain Text");
}


const popupMostLargeHeight = 360;










const continueCarryOftoken = [
  "--bg-raised",
  "--bg-subtle",
  "--bg-hover",
  "--doc-bg",
  "--fg",
  "--fg-muted",
  "--fg-faint",
  "--border",
  "--border-strong",
  "--accent",
  "--accent-fg",
  "--radius-sm",
  "--font-ui",
] as const;

export type languagePicker = {

  dom: HTMLElement;

  setLanguage2(lang: string): void;

  cancelDestroy(): void;
};

export function createLanguagePicker(option: {

  allLanguages: () => string[];

  searchSearchLanguage: () => string[];

  prepare?: () => Promise<void>;








  distinguishName: (lang: string) => readonly string[];

  currentLanguage: () => string;

  selectLanguage: (lang: string) => void;

  restoreFocus?: () => void;
}): languagePicker {
  // The field is both the collapsed label and the live search input.
  const field = document.createElement("input");
  field.type = "text";
  field.className = "nota-code-lang-input";
  field.title = t("Code Language");
  field.placeholder = t("Code Language");
  field.setAttribute("role", "combobox");
  field.setAttribute("aria-haspopup", "listbox");
  field.setAttribute("aria-expanded", "false");
  field.autocomplete = "off";
  field.spellcheck = false;

  /** Closed state: empty language is a true empty value with a placeholder. */
  function drawCloseCombine(lang: string) {
    field.value = lang === NO_LANGUAGE ? "" : lang;
  }
  drawCloseCombine(option.currentLanguage());


  let popup: HTMLElement | null = null;

  let input: HTMLInputElement | null = null;
  let currentItem = 0;







  function options(): HTMLElement[] {
    if (!popup) return [];
    return [...popup.querySelectorAll<HTMLElement>(".nota-lang-opt")];
  }


  function getItem2(i: number): HTMLElement | null {
    const plural = options();
    return i >= 0 && i < plural.length ? (plural[i] ?? null) : null;
  }

  function heightBright(i: number, rollPassGo = true) {
    getItem2(currentItem)?.classList.remove("nota-lang-opt-on");
    currentItem = i;
    const newValueOf = getItem2(i);
    newValueOf?.classList.add("nota-lang-opt-on");
    if (newValueOf && rollPassGo) rollToCanSee(newValueOf);
  }



  function createValueItem(lang: string, label: string, isCustom = false): HTMLElement {
    const opt = document.createElement("div");
    opt.className = isCustom ? "nota-lang-opt nota-lang-opt-custom" : "nota-lang-opt";
    opt.setAttribute("role", "option");
    opt.dataset.lang = lang;



    const optionName = document.createElement("span");
    optionName.className = "nota-lang-option-name";
    optionName.textContent = label;
    opt.append(languageIcon(lang), optionName);
    if (isCustom) {
      const tail = document.createElement("span");
      tail.className = "nota-lang-custom-note";
      tail.textContent = t("Custom");
      opt.appendChild(tail);
    }
    const isEmpty = option.currentLanguage();
    opt.setAttribute("aria-selected", String(lang === isEmpty));
    if (lang === isEmpty) opt.classList.add("nota-lang-opt-on");


    opt.addEventListener("mousedown", (e) => e.preventDefault());
    opt.addEventListener("click", () => {
      option.selectLanguage(lang);
      drawCloseCombine(lang);
      close(false);
      queueMicrotask(() => {
        if (option.restoreFocus) option.restoreFocus();
        else field.focus();
      });
    });
    return opt;
  }

















  function refreshNewValue() {
    if (!popup || !input) return;
    for (const el of options()) el.remove();
    const source = input.value.trim();
    const ask = source.toLowerCase();


    if (ask === "") popup.appendChild(createValueItem(NO_LANGUAGE, plainText()));
    const candidate = ask === "" ? option.allLanguages() : option.searchSearchLanguage();
    const match = candidate
      .filter((lang) => ask === "" || option.distinguishName(lang).some((name3) => name3.toLowerCase().includes(ask)))
      .sort((a, b) => {
        if (ask === "") return 0;
        const aBefore = a.toLowerCase().startsWith(ask) ? 1 : 0;
        const bBefore = b.toLowerCase().startsWith(ask) ? 1 : 0;
        const aImage = hasDedicatedBelongIcon(a) ? 1 : 0;
        const bImage = hasDedicatedBelongIcon(b) ? 1 : 0;
        return bBefore - aBefore || bImage - aImage || a.length - b.length || a.localeCompare(b);
      });
    for (const lang of match) {




      popup.appendChild(createValueItem(lang, lang));
    }
    if (ask !== "" && match.length === 0) {
      popup.appendChild(createValueItem(source, source, true));
    }
    const current = option.currentLanguage();
    const preciseConfirmItem = options().findIndex(
      (el) => el.dataset.lang === (ask === "" ? current : source),
    );
    heightBright(preciseConfirmItem >= 0 ? preciseConfirmItem : 0);
  }














  function rollToCanSee(item5: HTMLElement) {
    if (!popup) return;
    const top = item5.offsetTop;
    const bottom = top + item5.offsetHeight;
    if (top < popup.scrollTop) popup.scrollTop = top;
    else if (bottom > popup.scrollTop + popup.clientHeight) {
      popup.scrollTop = bottom - popup.clientHeight;
    }
  }


  function close(reset = true) {
    if (reset) drawCloseCombine(option.currentLanguage());
    if (!popup) return;
    popup.remove();
    popup = null;
    input = null;
    field.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", pointExternalSurface, true);
    document.removeEventListener("keydown", allLayoutKeypress, true);
    window.removeEventListener("resize", closeOnResize);


    window.removeEventListener("scroll", rollActionDone, true);
  }

  function pointExternalSurface(e: Event) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (popup?.contains(t) || field.contains(t)) return;
    close();
  }










  function rollActionDone(e: Event) {
    const t = e.target;
    if (t instanceof Node && (t === popup || popup?.contains(t))) return;
    close();
  }

  const closeOnResize = () => close();


  function open() {
    if (popup) return;

    const isEmpty = option.currentLanguage();

    const pop = document.createElement("div");
    pop.className = "nota-lang-popup";
    pop.setAttribute("role", "listbox");
    input = field;

    popup = pop;
    document.body.appendChild(pop);



    if (option.prepare) {
      const openedPopup = pop;
      void option
        .prepare()
        .then(() => {
          if (popup === openedPopup && input) refreshNewValue();
        })
        .catch((error: unknown) => {
          console.warn("[nota] Full code-language list failed to load; keeping the core list:", error);
        });
    }











    const borrowComeOf = getComputedStyle(field);
    for (const t of continueCarryOftoken) {
      const v = borrowComeOf.getPropertyValue(t).trim();
      if (v) pop.style.setProperty(t, v);
    }



    refreshNewValue();







    pop.style.maxHeight = `${popupMostLargeHeight}px`;

    const r = field.getBoundingClientRect();
    const height = pop.offsetHeight;
    // The candidates are a continuation of the field, not a second control.
    // Reuse both horizontal edges instead of applying an independent minimum.
    pop.style.width = `${r.width}px`;
    pop.style.minWidth = "0";
    const width = pop.offsetWidth;
    const edgeDistance = 4;
    let left = r.left;
    left = Math.max(edgeDistance, Math.min(left, window.innerWidth - width - edgeDistance));
    pop.style.left = `${left}px`;

    const belowSurfaceEnough = window.innerHeight - r.bottom > height + 8;
    if (belowSurfaceEnough) pop.style.top = `${r.bottom + 2}px`;
    else pop.style.top = `${Math.max(4, r.top - height - 2)}px`;

    field.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", pointExternalSurface, true);
    document.addEventListener("keydown", allLayoutKeypress, true);
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", rollActionDone, true);


    const i = options().findIndex((el) => el.dataset.lang === isEmpty);
    heightBright(i >= 0 ? i : 0);
  }



  function allLayoutKeypress(e: KeyboardEvent) {
    if (!popup) return;

    //







    //


    if (document.querySelector("[data-context-menu]")) return;


    if (e.isComposing) return;
    const totalNumber = options().length;
    switch (e.key) {
      case "Escape":
        close();
        field.focus();
        e.preventDefault();
        return;
      case "ArrowDown":
        heightBright(Math.min(currentItem + 1, totalNumber - 1));
        e.preventDefault();
        return;
      case "ArrowUp":
        heightBright(Math.max(currentItem - 1, 0));
        e.preventDefault();
        return;
      case "Home":
        heightBright(0);
        e.preventDefault();
        return;
      case "End":
        heightBright(totalNumber - 1);
        e.preventDefault();
        return;
      case "Enter": {




        const item5 = getItem2(currentItem);
        const lang = item5?.dataset.lang;
        if (lang !== undefined) {
          option.selectLanguage(lang);
          drawCloseCombine(lang);
        }
        close(false);
        queueMicrotask(() => {
          if (option.restoreFocus) option.restoreFocus();
          else field.focus();
        });
        e.preventDefault();
        return;
      }
    }




  }

  field.addEventListener("focus", () => {
    field.select();
    open();
  });
  field.addEventListener("click", () => open());
  field.addEventListener("input", () => {
    if (!popup) open();
    refreshNewValue();
  });

  return {
    dom: field,
    setLanguage2: (lang) => {
      if (document.activeElement !== field || !popup) drawCloseCombine(lang);
    },
    cancelDestroy: close,
  };
}
