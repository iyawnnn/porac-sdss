"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { useKeypress } from "@/hooks/use-keypress";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";

export type AdminSearchItem = { href: string; label: string; icon: LucideIcon };
export type AdminSearchSection = { heading: string; items: AdminSearchItem[] };

export function AdminSearch({ sections }: { sections: AdminSearchSection[] }) {
  const [open, setOpen] = useState(false);
  const [isMac] = useState(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  const router = useRouter();
  const { setOpenMobile, isMobile } = useSidebar();

  useKeypress({ combo: ["meta+k", "ctrl+k"], callback: () => setOpen(true) });

  // Closing must work even while focus is in the dialog's own search input,
  // so it can't go through useKeypress's input/textarea focus guard.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const onSelect = (href: string) => {
    setOpen(false);
    if (isMobile) setOpenMobile(false);
    router.push(href);
  };

  return (
    <>
      <InputGroup
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="cursor-pointer"
      >
        <InputGroupAddon align="inline-start" className="pl-1.75"><Search /></InputGroupAddon>
        <InputGroupInput aria-label="Open command palette" placeholder="Search..." readOnly tabIndex={-1} value="" />
        <InputGroupAddon align="inline-end">
          <KbdGroup><Kbd suppressHydrationWarning>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></KbdGroup>
        </InputGroupAddon>
      </InputGroup>
      <CommandDialog onOpenChange={setOpen} open={open} title="Admin navigation" description="Search for a page to navigate to">
        <Command>
          <CommandInput placeholder="Search navigation..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup heading={section.heading} key={section.heading}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.href} onSelect={() => onSelect(item.href)} value={item.label}>
                      <Icon /><span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
