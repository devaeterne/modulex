"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_SURFACE_CARD } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import {
  canConfigureProjectParticipantRoles,
  listProjectParticipantRolesForAdmin,
  upsertProjectParticipantRole,
  type ProjectParticipantRoleAdminRow,
} from "@/lib/customers/project-participant-role-admin";

const PARTICIPANT_ROLE_SETTINGS_PATH = "/settings/general/project-participant-roles";

export default function ProjectParticipantRoleManager() {
  const pathname = usePathname();
  const isSettingsRoute = pathname === PARTICIPANT_ROLE_SETTINGS_PATH;
  const [canConfigure, setCanConfigure] = useState(false);
  const [roles, setRoles] = useState<ProjectParticipantRoleAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState("");
  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState("true");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSettingsRoute) {
        setCanConfigure(false);
        setRoles([]);
        return;
      }
      const allowed = await canConfigureProjectParticipantRoles();
      setCanConfigure(allowed);
      if (!allowed) {
        setRoles([]);
        return;
      }
      setRoles(await listProjectParticipantRolesForAdmin());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Participant roles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isSettingsRoute]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRole() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await upsertProjectParticipantRole({ roleKey, label, isActive: isActive === "true" });
      setRoleKey("");
      setLabel("");
      setIsActive("true");
      setMessage("Participant role saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Participant role could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function editRole(role: ProjectParticipantRoleAdminRow) {
    setRoleKey(role.roleKey);
    setLabel(role.label);
    setIsActive(role.isActive ? "true" : "false");
    setError(null);
    setMessage(null);
  }

  if (!isSettingsRoute) return null;
  if (loading && !canConfigure) return null;
  if (!canConfigure) return null;

  return (
    <ComponentCard
      title="Project Participant Roles"
      desc="Configure reusable Project participant roles. Structural roles such as Sales Rep remain required and cannot be deactivated."
    >
      <div className="space-y-4">
        {error ? <div role="alert"><Alert variant="error" title="Participant role action failed" message={error} /></div> : null}
        {message ? <div role="status"><Alert variant="success" title="Participant role updated" message={message} /></div> : null}

        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Role</TableCell>
                <TableCell isHeader variant="admin">Key</TableCell>
                <TableCell isHeader variant="admin">Type</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={5}>Refreshing participant roles…</TableStateRow> : null}
              {!loading && roles.length === 0 ? <TableStateRow colSpan={5}>No participant roles are configured.</TableStateRow> : null}
              {!loading ? roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell variant="admin"><span className="font-medium">{role.label}</span></TableCell>
                  <TableCell variant="admin">{role.roleKey}</TableCell>
                  <TableCell variant="admin">{role.isSystem ? "System" : "Custom"}</TableCell>
                  <TableCell variant="admin"><Badge color={role.isActive ? "success" : "light"}>{role.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell variant="admin"><Button variant="outline" size="sm" onClick={() => editRole(role)}>Edit</Button></TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>

        <div className={`${ADMIN_SURFACE_CARD} grid gap-4 p-4 md:grid-cols-3`}>
          <div>
            <Label htmlFor="pb6-role-key">Role key</Label>
            <Input id="pb6-role-key" value={roleKey} onChange={(event) => setRoleKey(event.target.value.toLowerCase())} placeholder="designer_assistant" />
          </div>
          <div>
            <Label htmlFor="pb6-role-label">Role label</Label>
            <Input id="pb6-role-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Designer Assistant" />
          </div>
          <div>
            <Label htmlFor="pb6-role-active">Status</Label>
            <Select
              id="pb6-role-active"
              options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}
              value={isActive}
              onChange={setIsActive}
            />
          </div>
          <div className="flex justify-end md:col-span-3">
            <Button disabled={saving || !roleKey.trim() || !label.trim()} onClick={() => void saveRole()}>
              {saving ? "Saving…" : "Save Participant Role"}
            </Button>
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
