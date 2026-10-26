"use client";

import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { GoogleIcon } from "./google-icon";

/**
 * A button that opens sign-in as a bottom sheet instead of navigating to
 * `/signin`: slides up, drags down to dismiss, closes on Escape or a tap on the
 * backdrop. Each button owns its sheet, so it works from server components
 * (the landing page, the invite page) without any shared provider.
 *
 * The sheet is portalled to `<body>` because callers sit inside transformed
 * wrappers (scroll-reveal animations), which would otherwise become the
 * containing block for `position: fixed` and pin the sheet to the wrong box.
 */
export function SignInButton({
  callbackUrl = "/",
  className,
  children,
}: {
  callbackUrl?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The portal is only created after the first click, so it never renders on
  // the server and needs no mounted-flag effect.
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        className={className}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
      >
        {children}
      </button>
      {opened
        ? createPortal(
            <AnimatePresence>
              {open ? <Sheet callbackUrl={callbackUrl} onClose={close} /> : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 500;

function Sheet({ callbackUrl, onClose }: { callbackUrl: string; onClose: () => void }) {
  const titleId = useId();
  const [submitting, setSubmitting] = useState(false);
  const submit = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    submit.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md touch-none rounded-t-3xl bg-white px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onDragEnd}
      >
        <div
          aria-hidden="true"
          className="mx-auto h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600"
        />

        <div className="mt-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-brand flex size-11 items-center justify-center rounded-xl text-lg font-bold text-white"
          >
            S
          </span>
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              Welcome to SplitHome
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sign in to start sharing expenses.
            </p>
          </div>
        </div>

        <form
          className="mt-6"
          method="POST"
          action="/api/oauth/google"
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            ref={submit}
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-[colors,transform] hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 active:scale-[0.99] disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <GoogleIcon />
            {submitting ? "Opening Google…" : "Continue with Google"}
          </button>
        </form>

        <ul className="mt-5 space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li>New here? Your account is created the first time you sign in.</li>
          <li>Start a household and you become its admin.</li>
          <li>
            Got an invite link? Sign in, then open it to join with the role you were
            given.
          </li>
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-xl text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Not now
        </button>
      </motion.div>
    </div>
  );
}
