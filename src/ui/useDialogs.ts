




























import { useCallback, useRef, useState } from "react";







export type ConfirmAnswer = "confirm" | "cancel" | "extra";


export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  hideCancel?: boolean;








  extraLabel?: string;
}


export interface PromptRequest {
  title: string;
  label: string;












  initial?: string;






  confirmLabel?: string;
  placeholder?: string;
  hint?: string;
  secondLabel?: string;
  secondPlaceholder?: string;








  secret?: boolean;
}

export interface WindowPickerRequest {
  currentId: number;
  ids: number[];
}












export interface ImageRequest {

  documentSaved: boolean;





  ableAbovePass: boolean;




  meetingSelfActionAbovePass: boolean;
}











export interface LinkRequest {

  label: string;

  href: string;

  editing: boolean;
}







export type LinkAnswer =
  | { kind: "set"; label: string; href: string }
  | { kind: "remove" };


export interface ImageAnswer {

  source: { kind: "path"; path: string } | { kind: "url"; url: string };

  alt: string;





  abovePass: boolean;
}

export interface Dialogs {

  confirmReq: ConfirmRequest | null;

  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;

  answerConfirm: (answer: ConfirmAnswer) => void;

  promptReq: PromptRequest | null;

  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

  answerPrompt: (value: string | null, second?: string) => void;

  windowPickReq: WindowPickerRequest | null;
  askWindowPick: (req: WindowPickerRequest) => Promise<number | null>;
  answerWindowPick: (id: number | null) => void;

  imageReq: ImageRequest | null;

  askImage: (req: ImageRequest) => Promise<ImageAnswer | null>;

  answerImage: (answer: ImageAnswer | null) => void;

  linkReq: LinkRequest | null;

  askLink: (req: LinkRequest) => Promise<LinkAnswer | null>;

  answerLink: (answer: LinkAnswer | null) => void;

  emojiOpen: boolean;










  askEmoji: () => Promise<string | null>;

  answerEmoji: (character: string | null) => void;

  commandPaletteOpen: boolean;

  openCommandPalette: () => void;

  closeCommandPalette: () => void;












  aboutOpen: boolean;

  openAbout: () => void;

  closeAbout: () => void;
  /** Whether the compact first-run guide is open. */
  firstRunOpen: boolean;
  openFirstRun: () => void;
  closeFirstRun: () => void;
}

export function useDialogs(): Dialogs {
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const confirmResolve = useRef<((answer: ConfirmAnswer) => void) | null>(null);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null);
  const promptResolve = useRef<
    ((r: { value: string; second: string } | null) => void) | null
  >(null);

  const askConfirm = useCallback((req: ConfirmRequest) => {
    return new Promise<ConfirmAnswer>((resolve) => {
      confirmResolve.current = resolve;
      setConfirmReq(req);
    });
  }, []);

  const answerConfirm = useCallback((answer: ConfirmAnswer) => {
    setConfirmReq(null);
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    resolve?.(answer);
  }, []);

  const askPrompt = useCallback((req: PromptRequest) => {
    return new Promise<{ value: string; second: string } | null>((resolve) => {
      promptResolve.current = resolve;
      setPromptReq(req);
    });
  }, []);

  const answerPrompt = useCallback((value: string | null, second?: string) => {
    setPromptReq(null);
    const resolve = promptResolve.current;
    promptResolve.current = null;
    resolve?.(value === null ? null : { value, second: second ?? "" });
  }, []);

  const [windowPickReq, setWindowPickReq] = useState<WindowPickerRequest | null>(null);
  const windowPickResolve = useRef<((id: number | null) => void) | null>(null);

  const askWindowPick = useCallback((req: WindowPickerRequest) => {
    return new Promise<number | null>((resolve) => {
      windowPickResolve.current = resolve;
      setWindowPickReq(req);
    });
  }, []);

  const answerWindowPick = useCallback((id: number | null) => {
    setWindowPickReq(null);
    const resolve = windowPickResolve.current;
    windowPickResolve.current = null;
    resolve?.(id);
  }, []);

  const [imageReq, setImageReq] = useState<ImageRequest | null>(null);
  const imageResolve = useRef<((a: ImageAnswer | null) => void) | null>(null);

  const askImage = useCallback((req: ImageRequest) => {
    return new Promise<ImageAnswer | null>((resolve) => {
      imageResolve.current = resolve;
      setImageReq(req);
    });
  }, []);

  const answerImage = useCallback((answer: ImageAnswer | null) => {
    setImageReq(null);
    const resolve = imageResolve.current;
    imageResolve.current = null;
    resolve?.(answer);
  }, []);

  const [linkReq, setLinkReq] = useState<LinkRequest | null>(null);
  const linkResolve = useRef<((a: LinkAnswer | null) => void) | null>(null);

  const askLink = useCallback((req: LinkRequest) => {
    return new Promise<LinkAnswer | null>((resolve) => {
      linkResolve.current = resolve;
      setLinkReq(req);
    });
  }, []);

  const answerLink = useCallback((answer: LinkAnswer | null) => {
    setLinkReq(null);
    const resolve = linkResolve.current;
    linkResolve.current = null;
    resolve?.(answer);
  }, []);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiResolve = useRef<((character: string | null) => void) | null>(null);

  const askEmoji = useCallback(() => {
    return new Promise<string | null>((resolve) => {
      emojiResolve.current = resolve;
      setEmojiOpen(true);
    });
  }, []);

  const answerEmoji = useCallback((character: string | null) => {
    setEmojiOpen(false);
    const resolve = emojiResolve.current;
    emojiResolve.current = null;
    resolve?.(character);
  }, []);



  const [aboutOpen, setAbout] = useState(false);
  const openAbout = useCallback(() => setAbout(true), []);
  const closeAbout = useCallback(() => setAbout(false), []);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const openFirstRun = useCallback(() => setFirstRunOpen(true), []);
  const closeFirstRun = useCallback(() => setFirstRunOpen(false), []);

  return {
    confirmReq,
    askConfirm,
    answerConfirm,
    promptReq,
    askPrompt,
    answerPrompt,
    windowPickReq,
    askWindowPick,
    answerWindowPick,
    imageReq,
    askImage,
    answerImage,
    linkReq,
    askLink,
    answerLink,
    emojiOpen,
    askEmoji,
    answerEmoji,
    commandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    aboutOpen,
    openAbout,
    closeAbout,
    firstRunOpen,
    openFirstRun,
    closeFirstRun,
  };
}
