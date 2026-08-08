"use client";

import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import type { AdminAccountRow, AdminOffice, AdminRole } from "@/lib/types/admin-admins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLE_LABELS: Record<AdminRole, string> = {
  officer: "Officer",
  supervisor: "Supervisor",
  system_admin: "System Administrator",
};

function formatCreatedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emptyDraft() {
  return { firstName: "", lastName: "", email: "", password: "", role: "officer" as AdminRole, office: "MEO" as AdminOffice };
}

function CreateAdminDialog({ onCreated }: { onCreated: (admin: AdminAccountRow) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setDraft(emptyDraft());
    setError("");
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email,
        password: draft.password,
        role: draft.role,
        office: draft.role === "system_admin" ? null : draft.office,
      }),
    });

    if (res.ok) {
      const created = (await res.json()) as AdminAccountRow;
      onCreated(created);
      resetAndClose();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not create admin account.");
    }
    setSubmitting(false);
  }

  return (
    <Dialog onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Add Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add administrator account</DialogTitle>
          <DialogDescription>Creates a login with a temporary password. Share it with the admin out of band.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-first-name">First name</label>
              <Input id="admin-first-name" onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} required value={draft.firstName} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-last-name">Last name</label>
              <Input id="admin-last-name" onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} required value={draft.lastName} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-email">Email</label>
            <Input id="admin-email" onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} required type="email" value={draft.email} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-password">Temporary password</label>
            <Input
              id="admin-password"
              minLength={8}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              required
              type="password"
              value={draft.password}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-role">Role</label>
              <Select onValueChange={(v) => setDraft((d) => ({ ...d, role: v as AdminRole }))} value={draft.role}>
                <SelectTrigger aria-label="Role" id="admin-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="officer">Officer</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="system_admin">System Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-office">Office</label>
              <Select
                disabled={draft.role === "system_admin"}
                onValueChange={(v) => setDraft((d) => ({ ...d, office: v as AdminOffice }))}
                value={draft.role === "system_admin" ? "" : draft.office}
              >
                <SelectTrigger aria-label="Office" id="admin-office"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEO">MEO</SelectItem>
                  <SelectItem value="MDRRMO">MDRRMO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button disabled={submitting} type="submit">{submitting ? "Creating…" : "Create admin"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleOfficeEditor({ admin, onUpdated }: { admin: AdminAccountRow; onUpdated: (admin: AdminAccountRow) => void }) {
  const [role, setRole] = useState<AdminRole>(admin.role);
  const [office, setOffice] = useState<AdminOffice>(admin.office ?? "MEO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = role !== admin.role || (role !== "system_admin" && office !== (admin.office ?? "MEO"));

  async function handleSave() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, office: role === "system_admin" ? null : office }),
    });
    if (res.ok) {
      onUpdated((await res.json()) as AdminAccountRow);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Update failed");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={(v) => setRole(v as AdminRole)} value={role}>
          <SelectTrigger aria-label={`Role for ${admin.first_name} ${admin.last_name}`} className="h-8 w-40" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="officer">Officer</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="system_admin">System Administrator</SelectItem>
          </SelectContent>
        </Select>
        <Select disabled={role === "system_admin"} onValueChange={(v) => setOffice(v as AdminOffice)} value={role === "system_admin" ? "" : office}>
          <SelectTrigger aria-label={`Office for ${admin.first_name} ${admin.last_name}`} className="h-8 w-28" size="sm"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="MEO">MEO</SelectItem>
            <SelectItem value="MDRRMO">MDRRMO</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={!dirty || saving} onClick={handleSave} size="sm" variant="outline">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ResetPasswordDialog({ admin }: { admin: AdminAccountRow }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function resetAndClose() {
    setPassword("");
    setConfirmed(false);
    setError("");
    setDone(false);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/admin/admins/${admin.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password }),
    });

    if (res.ok) {
      setPassword("");
      setDone(true);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not reset the password.");
    }
    setSubmitting(false);
  }

  return (
    <Dialog onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound /> Reset password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password for {admin.first_name} {admin.last_name}</DialogTitle>
          <DialogDescription>
            {done
              ? "Password reset. Share the new temporary password with them out of band — it won't be shown again."
              : "Sets a new temporary password and signs them out of every existing session."}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogFooter><Button onClick={resetAndClose} type="button">Done</Button></DialogFooter>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`reset-password-${admin.id}`}>New temporary password</label>
              <Input
                id={`reset-password-${admin.id}`}
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required type="checkbox" />
              I understand this signs {admin.first_name} {admin.last_name} out everywhere.
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button disabled={submitting || !confirmed} type="submit">{submitting ? "Resetting…" : "Reset password"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminManagementWorkspace({
  initialAdmins,
  currentAdminId,
}: {
  initialAdmins: AdminAccountRow[];
  currentAdminId?: number;
}) {
  const [admins, setAdmins] = useState(initialAdmins);

  function handleCreated(created: AdminAccountRow) {
    setAdmins((prev) => [created, ...prev]);
  }
  function handleUpdated(updated: AdminAccountRow) {
    setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Admin Management</h1>
          <p className="text-sm text-muted-foreground">Create and manage MEO, MDRRMO, and System Administrator accounts.</p>
        </div>
        <CreateAdminDialog onCreated={handleCreated} />
      </div>

      {admins.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No administrator accounts yet.</CardContent></Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role &amp; office</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.first_name} {admin.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                    <TableCell><RoleOfficeEditor admin={admin} onUpdated={handleUpdated} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatCreatedDate(admin.created_at)}</TableCell>
                    <TableCell>
                      {admin.id === currentAdminId ? (
                        <p className="text-xs text-muted-foreground">Use Account &amp; Security to change your own password.</p>
                      ) : (
                        <ResetPasswordDialog admin={admin} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-2 sm:hidden">
            {admins.map((admin) => (
              <Card key={admin.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink-900">{admin.first_name} {admin.last_name}</p>
                    <Badge variant="outline">{ROLE_LABELS[admin.role]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{admin.email}</p>
                  <p className="text-xs text-muted-foreground">Created {formatCreatedDate(admin.created_at)}</p>
                  <RoleOfficeEditor admin={admin} onUpdated={handleUpdated} />
                  {admin.id === currentAdminId ? (
                    <p className="text-xs text-muted-foreground">Use Account &amp; Security to change your own password.</p>
                  ) : (
                    <ResetPasswordDialog admin={admin} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
