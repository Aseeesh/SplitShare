"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shows a freshly generated invitation link with copy and share buttons.
 *
 * The raw token exists only in this response (the database keeps its hash), so
 * this is the one chance to hand it over. Sharing it through a chat app is
 * usually faster than waiting for an email anyway.
 */
export function InviteLink({ url, email }: { url: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is selectable in the field below.
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950">
      <p className="text-xs text-emerald-900 dark:text-emerald-100">
        Send this link to {email}. It works once and expires in a few days.
      </p>
      <input
        readOnly
        value={url}
        aria-label="Invitation link"
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2 min-h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 font-mono text-xs dark:border-emerald-900 dark:bg-slate-950"
      />
      <div className="mt-2 flex gap-2">
        <Button type="button" onClick={copy} className="min-h-10 flex-1">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            onClick={() => {
              navigator
                .share({ title: "Join my household on SplitHome", url })
                .catch(() => undefined);
            }}
          >
            <Share2 className="size-4" /> Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}
