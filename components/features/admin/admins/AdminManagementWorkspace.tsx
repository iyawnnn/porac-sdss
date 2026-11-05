"use client";

import { useId, useState } from "react";
import { KeyRound, UserCheck, UserPlus, UserX } from "lucide-react";
import type { AdminAccountRow, AdminAccountType, AdminOffice } from "@/lib/types/admin-admins";
import { apiErrorMessage } from "@/lib/utils/api-error-message";
import { Checkbox } from "@/components/ui/checkbox";
import { accountLabel } from "@/lib/utils/adminScope";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "../shared/EmptyState";

type AccountFields = { accountType: AdminAccountType; office: AdminOffice | null; isFocal: boolean };
const OWN_ACCOUNT_REASON = "Another System Administrator must change your own account";

function StaffAccountFields({ value, onChange, disabled = false }: {
  value: AccountFields; onChange: (value: AccountFields) => void; disabled?: boolean;
}) {
  const id = useId();
  const personnel = value.accountType === "PERSONNEL";
  return (
    <fieldset className="flex flex-wrap items-end gap-3" disabled={disabled}>
      <legend className="sr-only">Staff account settings</legend>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={id + "-type"}>Account type</label>
        <Select disabled={disabled} value={value.accountType} onValueChange={(accountType: AdminAccountType) => onChange({
          accountType, office: accountType === "SYSTEM_ADMIN" ? null : (value.office ?? "MEO"), isFocal: false,
        })}>
          <SelectTrigger id={id + "-type"} className="h-8 w-44" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="PERSONNEL">Personnel</SelectItem>
            <SelectItem value="SYSTEM_ADMIN">System Administrator</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={id + "-office"}>Office</label>
        <Select disabled={disabled || !personnel} value={value.office ?? ""} onValueChange={(office: AdminOffice) => onChange({
          ...value, office, isFocal: office === "MDRRMO" && value.isFocal,
        })}>
          <SelectTrigger id={id + "-office"} className="h-8 w-28" size="sm"><SelectValue placeholder="" /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="MEO">MEO</SelectItem>
            <SelectItem value="MDRRMO">MDRRMO</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </div>
      <label className="flex h-8 items-center gap-2 text-xs" htmlFor={id + "-focal"}>
        <Checkbox id={id + "-focal"} checked={value.isFocal} disabled={disabled || !personnel || value.office !== "MDRRMO"}
          onCheckedChange={(checked) => onChange({ ...value, isFocal: checked === true })} />
        Focal responsibility
      </label>
    </fieldset>
  );
}

function formatCreatedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emptyDraft() {
  return { firstName: "", lastName: "", email: "", password: "", accountType: "PERSONNEL" as AdminAccountType, isFocal: false, office: "MEO" as AdminOffice | null };
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
        accountType: draft.accountType, office: draft.office, isFocal: draft.isFocal,
      }),
    });

    if (res.ok) {
      const created = (await res.json()) as AdminAccountRow;
      onCreated(created);
      resetAndClose();
    } else {
      const data = await res.json().catch(() => null);
      setError(apiErrorMessage(data, "Could not create admin account."));
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
          <StaffAccountFields value={draft} onChange={(fields) => setDraft((d) => ({ ...d, ...fields }))} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button disabled={submitting} type="submit">{submitting ? "Creating…" : "Create admin"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountOfficeEditor({ admin, onUpdated, disabled = false }: { admin: AdminAccountRow; onUpdated: (admin: AdminAccountRow) => void; disabled?: boolean }) {
  const [fields, setFields] = useState<AccountFields>({ accountType: admin.account_type, office: admin.office, isFocal: admin.is_focal });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = fields.accountType !== admin.account_type || fields.office !== admin.office || fields.isFocal !== admin.is_focal;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/admins/" + admin.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
      });
      if (res.ok) {
        onUpdated((await res.json()) as AdminAccountRow);
      } else {
        setError(apiErrorMessage(await res.json().catch(() => null), "Could not update this account."));
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <StaffAccountFields value={fields} onChange={setFields} disabled={disabled || saving} />
      <Button disabled={disabled || !dirty || saving} onClick={handleSave} size="sm" variant="outline">{saving ? "Saving..." : "Save"}</Button>
      {disabled && <p className="text-xs text-muted-foreground">{OWN_ACCOUNT_REASON}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
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
      setError(apiErrorMessage(data, "Could not reset the password."));
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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "outline" : "destructive"}>
      {active ? "Active" : "Deactivated"}
    </Badge>
  );
}

function DeactivateDialog({
  admin,
  disabledReason,
  onUpdated,
}: {
  admin: AdminAccountRow;
  disabledReason?: string;
  onUpdated: (admin: AdminAccountRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setConfirmed(false);
    setError("");
    setOpen(false);
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/admins/${admin.id}/deactivate`, { method: "POST" });
    if (res.ok) {
      onUpdated((await res.json()) as AdminAccountRow);
      resetAndClose();
    } else {
      const data = await res.json().catch(() => null);
      setError(apiErrorMessage(data, "Could not deactivate this admin."));
    }
    setSubmitting(false);
  }

  if (disabledReason) {
    return (
      <Button disabled size="sm" title={disabledReason} variant="outline">
        <UserX /> Deactivate
      </Button>
    );
  }

  return (
    <Dialog onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserX /> Deactivate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {admin.first_name} {admin.last_name}?</DialogTitle>
          <DialogDescription>
            This immediately signs them out of every existing session and blocks login until reactivated.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} type="checkbox" />
          I understand this signs {admin.first_name} {admin.last_name} out everywhere.
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button disabled={submitting || !confirmed} onClick={handleConfirm} type="button" variant="destructive">
            {submitting ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReactivateButton({ admin, onUpdated }: { admin: AdminAccountRow; onUpdated: (admin: AdminAccountRow) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/admins/${admin.id}/reactivate`, { method: "POST" });
    if (res.ok) {
      onUpdated((await res.json()) as AdminAccountRow);
    } else {
      const data = await res.json().catch(() => null);
      setError(apiErrorMessage(data, "Could not reactivate this admin."));
    }
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button disabled={submitting} onClick={handleClick} size="sm" variant="outline">
        <UserCheck /> {submitting ? "Reactivating…" : "Reactivate"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
  const activeSystemAdminCount = admins.filter((a) => a.account_type === "SYSTEM_ADMIN" && a.is_active).length;

  function handleCreated(created: AdminAccountRow) {
    setAdmins((prev) => [created, ...prev]);
  }
  function handleUpdated(updated: AdminAccountRow) {
    setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }
  function deactivateDisabledReason(admin: AdminAccountRow): string | undefined {
    if (admin.id === currentAdminId) return OWN_ACCOUNT_REASON;
    if (admin.account_type === "SYSTEM_ADMIN" && admin.is_active && activeSystemAdminCount <= 1) {
      return "Cannot deactivate the last active System Administrator.";
    }
    return undefined;
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
        <Card><CardContent className="p-0"><EmptyState className="p-8" title="No administrator accounts yet." /></CardContent></Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Account type &amp; office</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.first_name} {admin.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                    <TableCell><AccountOfficeEditor admin={admin} disabled={admin.id === currentAdminId} onUpdated={handleUpdated} /></TableCell>
                    <TableCell><StatusBadge active={admin.is_active} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatCreatedDate(admin.created_at)}</TableCell>
                    <TableCell>
                      {admin.id === currentAdminId ? (
                        <p className="text-xs text-muted-foreground">Use Account &amp; Security to change your own password.</p>
                      ) : (
                        <ResetPasswordDialog admin={admin} />
                      )}
                    </TableCell>
                    <TableCell>
                      {admin.is_active ? (
                        <DeactivateDialog admin={admin} disabledReason={deactivateDisabledReason(admin)} onUpdated={handleUpdated} />
                      ) : (
                        <ReactivateButton admin={admin} onUpdated={handleUpdated} />
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{accountLabel({ accountType: admin.account_type, isFocal: admin.is_focal })}</Badge>
                      <StatusBadge active={admin.is_active} />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{admin.email}</p>
                  <p className="text-xs text-muted-foreground">Created {formatCreatedDate(admin.created_at)}</p>
                  <AccountOfficeEditor admin={admin} disabled={admin.id === currentAdminId} onUpdated={handleUpdated} />
                  {admin.id === currentAdminId ? (
                    <p className="text-xs text-muted-foreground">Use Account &amp; Security to change your own password.</p>
                  ) : (
                    <ResetPasswordDialog admin={admin} />
                  )}
                  {admin.is_active ? (
                    <DeactivateDialog admin={admin} disabledReason={deactivateDisabledReason(admin)} onUpdated={handleUpdated} />
                  ) : (
                    <ReactivateButton admin={admin} onUpdated={handleUpdated} />
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
