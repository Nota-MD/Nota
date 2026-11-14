import { useEffect, useRef, useState } from "react";

import { useLanguage, useT } from "@/i18n";
import noticeEn from "@/ui/first-run-notice.en.html?raw";
import noticeZh from "@/ui/first-run-notice.zh.html?raw";
import { DialogClose } from "@/ui/DialogClose";
import { LicenseDialog } from "@/ui/LicenseDialog";
import { useModalTrap } from "@/ui/useModalTrap";

const pageCount = 3;

export function FirstRunGuide({ onDone }: { onDone: () => void }) {
  const t = useT();
  const uiLanguage = useLanguage();
  const [page, setPage] = useState(0);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useModalTrap(root, { onEscape: licenseOpen ? () => undefined : onDone });

  useEffect(() => {
    primary.current?.focus();
  }, [page]);

  const finish = () => onDone();
  const next = () => {
    if (page === pageCount - 1) finish();
    else setPage((value) => value + 1);
  };

  return (
    <>
      <div
        className="confirm-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) finish();
        }}
      >
        <div
          ref={root}
          className="confirm-dialog first-run-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t("Getting started with Nota")}
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
          data-page={page}
        >
          <DialogClose onClose={finish} />
          <div className="first-run-progress" aria-label={t("Step {0} of {1}", page + 1, pageCount)}>
            {Array.from({ length: pageCount }, (_, index) => (
              <span key={index} data-active={index === page || undefined} />
            ))}
          </div>

          {page === 0 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("A quick look")}</p>
              <h2>{t("Write Markdown. See the document.")}</h2>
              <p className="first-run-lead">
                {t("Nota is a local-first writing app. Your notes stay ordinary Markdown files.")}
              </p>
              <ul className="first-run-points">
                <li>{t("Formatting appears in place while you type.")}</li>
                <li>{t("Themes and extensions are optional and installed separately.")}</li>
                <li>{t("No account and no telemetry. Your writing stays on your device.")}</li>
              </ul>
            </section>
          )}

          {page === 1 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("Before you begin")}</p>
              <h2>{t("A short notice")}</h2>
              <p className="first-run-lead">
                {t("The complete notice is shown below. It is an explanation, not a replacement for the license.")}
              </p>
              <div
                className="first-run-notice-text"
                aria-label={t("Nota software notice")}
                role="document"
                tabIndex={0}
                dangerouslySetInnerHTML={{
                  __html: uiLanguage.startsWith("zh") ? noticeZh : noticeEn,
                }}
              />
            </section>
          )}

          {page === 2 && (
            <section className="first-run-page">
              <p className="first-run-kicker">{t("Rights and credits")}</p>
              <h2>{t("License and third-party notices")}</h2>
              <p className="first-run-lead">
                {t("The full BSD-2-Clause text is included with Nota. Third-party components keep their own licenses and appear under About → Credits.")}
              </p>
              <button type="button" className="btn first-run-license" onClick={() => setLicenseOpen(true)}>
                {t("View license")}
              </button>
            </section>
          )}

          <div className="first-run-actions">
            {page < pageCount - 1 ? (
              <button type="button" className="btn first-run-skip" onClick={finish}>
                {t("Skip")}
              </button>
            ) : <span />}
            <div className="first-run-next">
              {page > 0 && (
                <button type="button" className="btn" onClick={() => setPage((value) => value - 1)}>
                  {t("Back")}
                </button>
              )}
              <button ref={primary} type="button" className="btn btn-primary" onClick={next}>
                {page === pageCount - 1 ? t("Start writing") : t("Next")}
              </button>
            </div>
          </div>
        </div>
      </div>
      {licenseOpen && <LicenseDialog onClose={() => setLicenseOpen(false)} />}
    </>
  );
}
