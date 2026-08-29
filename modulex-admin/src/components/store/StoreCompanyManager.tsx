"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CompanyProfileSettings from "@/components/settings/CompanyProfileSettings";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  type CompanyContactChannel,
  type CompanyContactChannelType,
  type CompanyLocation,
  type CompanyLocationHour,
  type CompanyLocationType,
  normalizeCompanyContactInput,
  normalizeCompanyLocationInput,
} from "@/lib/store/company";
import {
  isValidCountryCode,
  isValidEmail,
  isValidHttpUrl,
  isValidPhone,
  normalizeCountryCode,
  sanitizePhoneInput,
} from "@/lib/validation";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const dangerButton = "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyChannel = (): Omit<CompanyContactChannel, "id" | "created_at" | "updated_at"> => ({
  channel_type: "email",
  label: "",
  value: "",
  href: null,
  sort_order: 0,
  is_active: false,
});

const emptyLocation = (): Omit<CompanyLocation, "id" | "created_at" | "updated_at"> => ({
  location_type: "showroom",
  name: "",
  email: null,
  phone: null,
  address_line_1: null,
  address_line_2: null,
  city: null,
  state_region: null,
  postal_code: null,
  country_code: null,
  map_url: null,
  sort_order: 0,
  is_active: false,
});

function isSafeContactHref(value: string | null) {
  if (!value?.trim()) return true;
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(value.trim());
}

function Field({ label, value, onChange, disabled, type = "text", placeholder }: { label: string; value: string | number | null; onChange: (value: string) => void; disabled: boolean; type?: string; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span><input className={inputClass} type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} /></label>;
}

function PublicState({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{active ? "Active — public" : "Inactive — not public"}</span>;
}

export default function StoreCompanyManager() {
  const [channels, setChannels] = useState<CompanyContactChannel[]>([]);
  const [locations, setLocations] = useState<CompanyLocation[]>([]);
  const [hours, setHours] = useState<CompanyLocationHour[]>([]);
  const [newChannel, setNewChannel] = useState(emptyChannel());
  const [newLocation, setNewLocation] = useState(emptyLocation());
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }
    setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

    const [channelResult, locationResult, hourResult] = await Promise.all([
      supabase.from("company_contact_channels").select("*").order("sort_order").order("label"),
      supabase.from("company_locations").select("*").order("sort_order").order("name"),
      supabase.from("company_location_hours").select("*").order("location_id").order("day_of_week"),
    ]);
    const firstError = channelResult.error || locationResult.error || hourResult.error;
    if (firstError) setError(firstError.message);
    else {
      setChannels((channelResult.data ?? []) as CompanyContactChannel[]);
      setLocations((locationResult.data ?? []) as CompanyLocation[]);
      setHours((hourResult.data ?? []) as CompanyLocationHour[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function patchChannel(id: string, patch: Partial<CompanyContactChannel>) {
    setChannels((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function patchLocation(id: string, patch: Partial<CompanyLocation>) {
    setLocations((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function patchHour(id: string, patch: Partial<CompanyLocationHour>) {
    setHours((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function validateChannel(channel: Pick<CompanyContactChannel, "channel_type" | "label" | "value" | "href">) {
    if (!channel.label.trim() || !channel.value.trim()) return "Contact channel label and value are required.";
    if (channel.channel_type === "email" && !isValidEmail(channel.value)) return "Enter a valid email contact value.";
    if (channel.channel_type === "phone" && !isValidPhone(channel.value)) return "Enter a valid phone contact value.";
    if (channel.channel_type === "website" && !isValidHttpUrl(channel.value)) return "Website contact values must be valid HTTP(S) URLs.";
    if (!isSafeContactHref(channel.href)) return "Contact links may only use HTTP(S), mailto:, or tel: schemes.";
    return null;
  }

  function validateLocation(location: Pick<CompanyLocation, "name" | "email" | "phone" | "country_code" | "map_url">) {
    if (!location.name.trim()) return "Location name is required.";
    if (!isValidEmail(location.email)) return "Enter a valid location email.";
    if (!isValidPhone(location.phone)) return "Enter a valid location phone.";
    if (!isValidCountryCode(location.country_code)) return "Country code must be a two-letter ISO code.";
    if (!isValidHttpUrl(location.map_url)) return "Map URL must be a valid HTTP(S) URL.";
    return null;
  }

  async function createChannel() {
    const validation = validateChannel(newChannel);
    if (validation) return setError(validation);
    setBusy(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("company_contact_channels").insert({
      ...newChannel,
      label: newChannel.label.trim(),
      value: newChannel.value.trim(),
      href: newChannel.href?.trim() || null,
      is_active: false,
    });
    if (saveError) setError(saveError.message);
    else { setNewChannel(emptyChannel()); setSuccess("Contact channel created as inactive."); await load(); }
    setBusy(false);
  }

  async function saveChannel(channel: CompanyContactChannel) {
    const validation = validateChannel(channel);
    if (validation) return setError(validation);
    setBusy(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("company_contact_channels").update(normalizeCompanyContactInput(channel)).eq("id", channel.id);
    if (saveError) setError(saveError.message); else setSuccess("Contact channel saved.");
    setBusy(false);
  }

  async function deleteChannel(id: string) {
    if (!window.confirm("Delete this contact channel?")) return;
    setBusy(true); setError(null);
    const { error: deleteError } = await supabase.from("company_contact_channels").delete().eq("id", id);
    if (deleteError) setError(deleteError.message); else setChannels((current) => current.filter((item) => item.id !== id));
    setBusy(false);
  }

  async function createLocation() {
    const validation = validateLocation(newLocation);
    if (validation) return setError(validation);
    setBusy(true); setError(null); setSuccess(null);
    const payload = normalizeCompanyLocationInput({ ...newLocation, id: "draft", created_at: "", updated_at: "" });
    const { error: saveError } = await supabase.from("company_locations").insert({ ...payload, is_active: false });
    if (saveError) setError(saveError.message);
    else { setNewLocation(emptyLocation()); setSuccess("Location created as inactive."); await load(); }
    setBusy(false);
  }

  async function saveLocation(location: CompanyLocation) {
    const validation = validateLocation(location);
    if (validation) return setError(validation);
    setBusy(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("company_locations").update(normalizeCompanyLocationInput(location)).eq("id", location.id);
    if (saveError) setError(saveError.message); else setSuccess("Location saved.");
    setBusy(false);
  }

  async function deleteLocation(id: string) {
    if (!window.confirm("Delete this location and its business hours?")) return;
    setBusy(true); setError(null);
    const { error: deleteError } = await supabase.from("company_locations").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    else {
      setLocations((current) => current.filter((item) => item.id !== id));
      setHours((current) => current.filter((item) => item.location_id !== id));
    }
    setBusy(false);
  }

  async function addHour(locationId: string) {
    const usedDays = new Set(hours.filter((item) => item.location_id === locationId).map((item) => item.day_of_week));
    const day = DAYS.findIndex((_, index) => !usedDays.has(index));
    if (day < 0) return setError("All seven days already have an hours row.");
    setBusy(true); setError(null);
    const { error: insertError } = await supabase.from("company_location_hours").insert({ location_id: locationId, day_of_week: day, is_closed: true, opens_at: null, closes_at: null, note: null });
    if (insertError) setError(insertError.message); else await load();
    setBusy(false);
  }

  async function saveHour(hour: CompanyLocationHour) {
    if (!hour.is_closed && (!hour.opens_at || !hour.closes_at || hour.opens_at >= hour.closes_at)) return setError("Open days require a valid opening time before closing time.");
    setBusy(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("company_location_hours").update({
      day_of_week: hour.day_of_week,
      opens_at: hour.is_closed ? null : hour.opens_at,
      closes_at: hour.is_closed ? null : hour.closes_at,
      is_closed: hour.is_closed,
      note: hour.note?.trim() || null,
    }).eq("id", hour.id);
    if (saveError) setError(saveError.message); else setSuccess("Business hours saved.");
    setBusy(false);
  }

  async function deleteHour(id: string) {
    setBusy(true); setError(null);
    const { error: deleteError } = await supabase.from("company_location_hours").delete().eq("id", id);
    if (deleteError) setError(deleteError.message); else setHours((current) => current.filter((item) => item.id !== id));
    setBusy(false);
  }

  const hoursByLocation = useMemo(() => {
    const map = new Map<string, CompanyLocationHour[]>();
    for (const item of hours) map.set(item.location_id, [...(map.get(item.location_id) ?? []), item]);
    return map;
  }, [hours]);

  if (loading) return <div className={cardClass}>Loading company workspace...</div>;
  const disabled = !canEdit || busy;

  return <div className="space-y-6">
    <CompanyProfileSettings />

    {(error || success) && <div className={`${cardClass} ${error ? "border-error-200" : "border-success-200"}`}><p className={`text-sm ${error ? "text-error-700" : "text-success-700"}`}>{error || success}</p></div>}

    <section className={cardClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Contact Channels</h2><p className="mt-1 text-sm text-gray-500">Repeatable public contact methods. New records always start inactive.</p></div></div>
      <div className="mt-5 space-y-4">
        {channels.map((channel) => <div key={channel.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-4 flex items-center justify-between gap-3"><PublicState active={channel.is_active} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={channel.is_active} disabled={disabled} onChange={(e) => patchChannel(channel.id, { is_active: e.target.checked })} /> Public</label></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</span><select className={inputClass} value={channel.channel_type} disabled={disabled} onChange={(e) => patchChannel(channel.id, { channel_type: e.target.value as CompanyContactChannelType })}><option value="email">Email</option><option value="phone">Phone</option><option value="website">Website</option><option value="other">Other</option></select></label>
            <Field label="Label" value={channel.label} disabled={disabled} onChange={(value) => patchChannel(channel.id, { label: value })} />
            <Field label="Value" value={channel.value} disabled={disabled} onChange={(value) => patchChannel(channel.id, { value })} />
            <Field label="Link" value={channel.href} disabled={disabled} onChange={(value) => patchChannel(channel.id, { href: value })} placeholder="mailto:, tel:, https://" />
            <Field label="Sort" type="number" value={channel.sort_order} disabled={disabled} onChange={(value) => patchChannel(channel.id, { sort_order: Number(value) || 0 })} />
          </div>
          {canEdit && <div className="mt-4 flex gap-2"><button className={primaryButton} disabled={disabled} onClick={() => void saveChannel(channel)}>Save</button><button className={dangerButton} disabled={disabled} onClick={() => void deleteChannel(channel.id)}>Delete</button></div>}
        </div>)}

        {canEdit && <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add contact channel</h3><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</span><select className={inputClass} value={newChannel.channel_type} disabled={disabled} onChange={(e) => setNewChannel((current) => ({ ...current, channel_type: e.target.value as CompanyContactChannelType }))}><option value="email">Email</option><option value="phone">Phone</option><option value="website">Website</option><option value="other">Other</option></select></label><Field label="Label" value={newChannel.label} disabled={disabled} onChange={(value) => setNewChannel((current) => ({ ...current, label: value }))} /><Field label="Value" value={newChannel.value} disabled={disabled} onChange={(value) => setNewChannel((current) => ({ ...current, value }))} /><Field label="Link" value={newChannel.href} disabled={disabled} onChange={(value) => setNewChannel((current) => ({ ...current, href: value }))} /><Field label="Sort" type="number" value={newChannel.sort_order} disabled={disabled} onChange={(value) => setNewChannel((current) => ({ ...current, sort_order: Number(value) || 0 }))} /></div><button className={`${primaryButton} mt-4`} disabled={disabled} onClick={() => void createChannel()}>Create inactive channel</button></div>}
      </div>
    </section>

    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Locations & Showrooms</h2><p className="mt-1 text-sm text-gray-500">A company address is not automatically a showroom. Only explicitly active locations are public.</p>
      <div className="mt-5 space-y-5">
        {locations.map((location) => <div key={location.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><strong className="text-sm text-gray-800 dark:text-white/90">{location.name}</strong><PublicState active={location.is_active} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={location.is_active} disabled={disabled} onChange={(e) => patchLocation(location.id, { is_active: e.target.checked })} /> Public</label></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</span><select className={inputClass} value={location.location_type} disabled={disabled} onChange={(e) => patchLocation(location.id, { location_type: e.target.value as CompanyLocationType })}><option value="office">Office</option><option value="showroom">Showroom</option><option value="warehouse">Warehouse</option><option value="other">Other</option></select></label>
            <Field label="Name" value={location.name} disabled={disabled} onChange={(value) => patchLocation(location.id, { name: value })} />
            <Field label="Email" type="email" value={location.email} disabled={disabled} onChange={(value) => patchLocation(location.id, { email: value })} />
            <Field label="Phone" value={location.phone} disabled={disabled} onChange={(value) => patchLocation(location.id, { phone: sanitizePhoneInput(value) })} />
            <Field label="Address line 1" value={location.address_line_1} disabled={disabled} onChange={(value) => patchLocation(location.id, { address_line_1: value })} />
            <Field label="Address line 2" value={location.address_line_2} disabled={disabled} onChange={(value) => patchLocation(location.id, { address_line_2: value })} />
            <Field label="City" value={location.city} disabled={disabled} onChange={(value) => patchLocation(location.id, { city: value })} />
            <Field label="State / Region" value={location.state_region} disabled={disabled} onChange={(value) => patchLocation(location.id, { state_region: value })} />
            <Field label="Postal code" value={location.postal_code} disabled={disabled} onChange={(value) => patchLocation(location.id, { postal_code: value })} />
            <Field label="Country" value={location.country_code} disabled={disabled} onChange={(value) => patchLocation(location.id, { country_code: normalizeCountryCode(value) })} />
            <Field label="Map URL" value={location.map_url} disabled={disabled} onChange={(value) => patchLocation(location.id, { map_url: value })} />
            <Field label="Sort" type="number" value={location.sort_order} disabled={disabled} onChange={(value) => patchLocation(location.id, { sort_order: Number(value) || 0 })} />
          </div>
          {canEdit && <div className="mt-4 flex gap-2"><button className={primaryButton} disabled={disabled} onClick={() => void saveLocation(location)}>Save location</button><button className={dangerButton} disabled={disabled} onClick={() => void deleteLocation(location.id)}>Delete</button></div>}

          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Business hours</h4>{canEdit && <button className={buttonClass} disabled={disabled} onClick={() => void addHour(location.id)}>Add day</button>}</div><div className="mt-3 space-y-2">{(hoursByLocation.get(location.id) ?? []).map((hour) => <div key={hour.id} className="grid items-end gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50 md:grid-cols-6"><label><span className="mb-1 block text-xs text-gray-500">Day</span><select className={inputClass} value={hour.day_of_week} disabled={disabled} onChange={(e) => patchHour(hour.id, { day_of_week: Number(e.target.value) })}>{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={hour.is_closed} disabled={disabled} onChange={(e) => patchHour(hour.id, { is_closed: e.target.checked })} /> Closed</label><Field label="Opens" type="time" value={hour.opens_at?.slice(0, 5) ?? ""} disabled={disabled || hour.is_closed} onChange={(value) => patchHour(hour.id, { opens_at: value || null })} /><Field label="Closes" type="time" value={hour.closes_at?.slice(0, 5) ?? ""} disabled={disabled || hour.is_closed} onChange={(value) => patchHour(hour.id, { closes_at: value || null })} /><Field label="Note" value={hour.note} disabled={disabled} onChange={(value) => patchHour(hour.id, { note: value })} /><div className="flex gap-2"><button className={buttonClass} disabled={disabled} onClick={() => void saveHour(hour)}>Save</button><button className={dangerButton} disabled={disabled} onClick={() => void deleteHour(hour.id)}>Delete</button></div></div>)}{(hoursByLocation.get(location.id) ?? []).length === 0 && <p className="text-sm text-gray-500">No verified business hours entered.</p>}</div></div>
        </div>)}

        {canEdit && <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add location</h3><p className="mt-1 text-xs text-gray-500">Creating a location does not publish it.</p><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Type</span><select className={inputClass} value={newLocation.location_type} disabled={disabled} onChange={(e) => setNewLocation((current) => ({ ...current, location_type: e.target.value as CompanyLocationType }))}><option value="office">Office</option><option value="showroom">Showroom</option><option value="warehouse">Warehouse</option><option value="other">Other</option></select></label><Field label="Name" value={newLocation.name} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, name: value }))} /><Field label="Email" value={newLocation.email} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, email: value }))} /><Field label="Phone" value={newLocation.phone} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, phone: sanitizePhoneInput(value) }))} /><Field label="Address line 1" value={newLocation.address_line_1} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, address_line_1: value }))} /><Field label="City" value={newLocation.city} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, city: value }))} /><Field label="State / Region" value={newLocation.state_region} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, state_region: value }))} /><Field label="Postal code" value={newLocation.postal_code} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, postal_code: value }))} /><Field label="Country" value={newLocation.country_code} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, country_code: normalizeCountryCode(value) }))} /><Field label="Map URL" value={newLocation.map_url} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, map_url: value }))} /><Field label="Sort" type="number" value={newLocation.sort_order} disabled={disabled} onChange={(value) => setNewLocation((current) => ({ ...current, sort_order: Number(value) || 0 }))} /></div><button className={`${primaryButton} mt-4`} disabled={disabled} onClick={() => void createLocation()}>Create inactive location</button></div>}
      </div>
    </section>
  </div>;
}
