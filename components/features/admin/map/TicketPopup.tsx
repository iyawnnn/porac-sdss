"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageOffIcon, MapPinIcon, XIcon } from "lucide-react";
import type { AdminTicketGeoRow } from "@/lib/types/admin-tickets";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { getCategoryMarkerSpec } from "@/lib/gis/categoryMarker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill } from "../shared/StatusPill";

export function TicketPopup({ ticket, onClose }: { ticket: AdminTicketGeoRow; onClose: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = ticket.title ?? ticket.category;
  const spec = getCategoryMarkerSpec(ticket.category);
  const CategoryIcon = spec.icon;
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);

  return (
    <Card className="w-80 gap-3 py-3 shadow-lg" size="sm">
      {ticket.image_url && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote report media is served by the API and is not necessarily configured for next/image.
        <img alt={`Photo submitted for ${title} in ${ticket.barangay_name}`} className="aspect-video w-full object-cover" onError={() => setImageFailed(true)} src={ticket.image_url} />
      ) : (
        <div aria-label="No submitted image" className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground" role="img">
          <ImageOffIcon aria-hidden="true" />
        </div>
      )}
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: spec.color }}>
            <CategoryIcon aria-hidden="true" className="size-3.5 text-white" />
          </span>
          <span className="truncate text-xs font-medium text-muted-foreground">{ticket.category}</span>
        </div>
        <CardTitle className="line-clamp-2">{title}</CardTitle>
        <p className="font-mono text-xs text-muted-foreground">Ticket #{ticket.id}</p>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="Close ticket details" className="cursor-pointer" onClick={onClose} size="icon-sm" variant="ghost"><XIcon /></Button>
            </TooltipTrigger>
            <TooltipContent>Close details</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={urgencyBadge.className} variant="outline">{urgencyBadge.label} urgency</Badge>
          <Badge className="font-mono tabular-nums" variant="secondary">Score {ticket.priority_score ?? "Unavailable"}</Badge>
          <StatusPill status={ticket.status} />
        </div>
        <Separator />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="min-w-0"><dt className="text-muted-foreground">Barangay</dt><dd className="flex items-center gap-1 truncate font-medium"><MapPinIcon aria-hidden="true" className="size-3.5 shrink-0" />{ticket.barangay_name}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">Assigned office</dt><dd className="truncate font-medium">{ticket.assigned_office}</dd></div>
        </dl>
      </CardContent>
      <CardFooter className="p-3"><Button asChild className="w-full cursor-pointer" size="sm"><Link href={`/admin/tickets/${ticket.id}`}>View Ticket</Link></Button></CardFooter>
    </Card>
  );
}