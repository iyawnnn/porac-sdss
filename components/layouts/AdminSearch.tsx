"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useKeypress } from "@/hooks/use-keypress";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useSidebar } from "@/components/ui/sidebar";

export type AdminSearchItem = { href: string; label: string };

export function AdminSearch({ items }: { items: AdminSearchItem[] }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const matches = query.trim() ? items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())) : [];

  useKeypress({ combo: ["meta+k", "ctrl+k"], callback: () => {
    groupRef.current?.querySelector<HTMLInputElement>("[data-slot=input-group-control]")?.focus({ preventScroll: true });
    setOpen(true);
  } });

  return (
    <div className="relative">
      <InputGroup ref={groupRef}>
        <InputGroupAddon align="inline-start" className="pl-1.75"><Search /></InputGroupAddon>
        <InputGroupInput aria-label="Search navigation" onChange={(event) => setQuery(event.target.value)} placeholder="Search..." type="search" value={query} />
        <InputGroupAddon align="inline-end"><KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup></InputGroupAddon>
      </InputGroup>
      {matches.length > 0 && (
        <ul aria-label="Navigation search results" className="absolute inset-x-0 top-10 z-20 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {matches.map((item) => (
            <li key={item.href}>
              <Link className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground" href={item.href} onClick={() => { setQuery(""); if (isMobile) setOpenMobile(false); }}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
