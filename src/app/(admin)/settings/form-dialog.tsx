"use client";

import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Dialog shell for the settings edit forms. The form inside calls
// useCloseDialog() and runs it after a successful save.

const CloseContext = createContext<() => void>(() => {});

export const useCloseDialog = () => useContext(CloseContext);

export function FormDialog({
  trigger,
  title,
  description,
  children,
  wide,
}: {
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className={wide ? "max-h-[90dvh] overflow-y-auto sm:max-w-2xl" : "max-h-[90dvh] overflow-y-auto sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from fresh values. */}
        {open ? <CloseContext.Provider value={close}>{children}</CloseContext.Provider> : null}
      </DialogContent>
    </Dialog>
  );
}
