"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportDownload } from "../shared/ExportDownload";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";

function DatedExport({ kind, title, description, dateLabel }: {
  kind: string; title: string; description: string; dateLabel: string;
}) {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({ status });
  if (category !== "all") params.set("category", category);
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label htmlFor={`${kind}-status`}>Ticket status</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id={`${kind}-status`} aria-label={`${title} status`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active / Open</SelectItem>
            {TICKET_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        <label htmlFor={`${kind}-category`}>Category</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id={`${kind}-category`} aria-label={`${title} category`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">All categories</SelectItem>
            {TICKET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        <label htmlFor={`${kind}-from`}>{dateLabel} from (Manila)</label>
        <Input id={`${kind}-from`} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <label htmlFor={`${kind}-to`}>{dateLabel} to (Manila)</label>
        <Input id={`${kind}-to`} type="date" value={to} onChange={e => setTo(e.target.value)} />
        <ExportDownload className="self-start" href={`/api/admin/reports/${kind}.csv?${params}`}>
          <DownloadIcon data-icon="inline-start" />Export {title} CSV
        </ExportDownload>
      </CardContent>
    </Card>
  );
}

export function AdditionalReportExports() {
  const [top, setTop] = useState("20");
  return (
    <div className="grid gap-4 md:grid-cols-2 print:hidden">
      <DatedExport kind="submitted-reports" title="Submitted Reports" dateLabel="Submitted" description="Report references and structured evidence signals for your office. Citizen identity and content are excluded." />
      <DatedExport kind="operational-assessments" title="Operational Assessments" dateLabel="Assessed" description="Your office's assessed tickets, including assessment text and Work Order counts." />
      <Card>
        <CardHeader><CardTitle className="text-sm">Priority Incidents</CardTitle><CardDescription>Active tickets in your office, ordered by Operational Priority. Ties show the oldest tickets first.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label htmlFor="priority-export-top">Top N</label>
          <Input id="priority-export-top" type="number" min={1} max={200} step={1} value={top} onChange={e => setTop(e.target.value)} aria-describedby="priority-export-help" />
          <p id="priority-export-help" className="text-sm text-muted-foreground">Choose 1 to 200 active tickets.</p>
          <ExportDownload className="self-start" href={`/api/admin/reports/priority-incidents.csv?${new URLSearchParams({ top })}`}>
            <DownloadIcon data-icon="inline-start" />Export Priority Incidents CSV
          </ExportDownload>
        </CardContent>
      </Card>
    </div>
  );
}
