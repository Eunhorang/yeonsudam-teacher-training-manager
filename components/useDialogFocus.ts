"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([type='hidden']):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// 모달이 열린 동안 키보드 포커스를 모달 안에 유지하고,
// 닫을 때 사용자가 원래 눌렀던 버튼으로 되돌립니다.
export function useDialogFocus(
  open: boolean,
  activeDialogKey: unknown = open,
  preferredReturnFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) return;
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        returnFocusRef.current = event.target;
      }
    };
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      returnFocusRef.current = document.activeElement;
    }
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, [open]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previousFocus =
      preferredReturnFocusRef?.current ?? returnFocusRef.current;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "#root > .github-pages-notice, .training-app > :not(.modal-backdrop)",
      ),
    );
    const previousBackgroundState = backgroundElements.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    backgroundElements.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });

    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hidden && element.offsetParent !== null,
      );

    if (!dialog.contains(document.activeElement)) {
      (focusableElements()[0] ?? dialog).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousBackgroundState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus();
      if (preferredReturnFocusRef) preferredReturnFocusRef.current = null;
    };
  }, [activeDialogKey, open, preferredReturnFocusRef]);

  return dialogRef;
}
