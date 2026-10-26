"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 500;

/**
 * A mobile-style bottom sheet: springs up from the bottom edge over a dimmed
 * backdrop, and dismisses by dragging the handle down, tapping outside, or
 * pressing Escape.
 *
 * Only the handle area starts a drag, so the content can scroll (and inputs can
 * be used) without fighting the gesture.
 *
 * It is portalled to `<body>` because callers often sit inside transformed
 * wrappers, which would become the containing block for `position: fixed`.
 * Controlled: the parent owns `open`. Focus moves into the sheet on open and
 * back to whatever had it on close.
 */
export function BottomSheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the element inside `children` that names the dialog. */
  titleId: string;
  children: React.ReactNode;
}) {
  // The portal needs `document`, so it is only created once the sheet has been
  // opened on the client, never during server render.
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) {
    setEverOpened(true);
  }
  if (!everOpened) {
    return null;
  }
  return createPortal(
    <AnimatePresence>
      {open ? (
        <Sheet titleId={titleId} onClose={onClose}>
          {children}
        </Sheet>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Sheet({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const target =
      panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
    target?.focus();

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
      returnTo?.focus?.();
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
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl outline-none dark:bg-slate-900"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onDragEnd}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center px-6 pt-3 pb-2"
          onPointerDown={(event) => controls.start(event)}
        >
          <div
            aria-hidden="true"
            className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
