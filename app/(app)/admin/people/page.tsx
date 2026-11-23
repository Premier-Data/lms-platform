"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  UserPlus,
  Mail,
  Search,
  Upload,
  KeyRound,
  Archive,
  ArchiveRestore,
} from "lucide-react";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  location: string;
  status: "active" | "invited" | "archived";
  created_at: string;
  last_sign_in_at: string | null;
};

// Countries available for the inline location dropdown.
const COUNTRIES = [
  "Australia",
  "New Zealand",
  "United Kingdom",
  "Ireland",
  "United States",
  "Canada",
  "South Africa",
  "India",
  "Singapore",
  "Malaysia",
  "Vietnam",
  "Philippines",
  "Indonesia",
  "Japan",
  "China",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Brazil",
  "Argentina",
  "United Arab Emirates",
];

export default function PeoplePage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Sort & filter controls
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    | "name"
    | "email"
    | "role"
    | "location"
    | "status"
    | "last_sign_in"
    | "last_active"
    | "created"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("learner");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  // Edit modal state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  // Delete confirmation
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Account actions (edit modal)
  const [actionLoading, setActionLoading] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Inline location save (per row)
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null);

  async function saveLocationInline(userId: string, location: string) {
    // Optimistically update the row.
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, location } : u))
    );
    setSavingLocationId(userId);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    });
    setSavingLocationId(null);
    if (!res.ok) {
      // Revert by refetching on failure.
      fetchUsers();
    }
  }

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [csvUsers, setCsvUsers] = useState<
    { email: string; full_name: string; role: string }[]
  >([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    invited: number;
    failed: number;
    skipped: number;
  } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  // Live "last active" (from activity tracking). Refreshed every 5 minutes
  // and whenever the admin comes back to this tab.
  const [presence, setPresence] = useState<
    Record<string, { last_active_at: string | null; status: "active" | "idle" | "offline" }>
  >({});
  const [, setClock] = useState(0);
  useEffect(() => {
    let alive = true;
    async function loadPresence() {
      try {
        const res = await fetch("/api/admin/activity/presence");
        if (!res.ok || !alive) return;
        const d = await res.json();
        const map: Record<string, { last_active_at: string | null; status: "active" | "idle" | "offline" }> = {};
        for (const p of d.presence ?? []) map[p.user_id] = { last_active_at: p.last_active_at, status: p.status };
        setPresence(map);
      } catch {
        // ignore; try again next time
      }
    }
    loadPresence();
    const t = setInterval(loadPresence, 5 * 60_000);
    // keep "x min ago" labels current between refreshes
    const tick = setInterval(() => setClock((n) => n + 1), 60_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") loadPresence();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  /** Latest of tracked activity and last sign-in. */
  function lastActiveOf(u: { id: string; last_sign_in_at: string | null }): string | null {
    const a = presence[u.id]?.last_active_at ?? null;
    const s = u.last_sign_in_at;
    if (a && s) return a > s ? a : s;
    return a ?? s;
  }

  async function fetchUsers() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/users");

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to load users");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setUsers(data.users);
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMessage("");

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        role: inviteRole,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setInviteMessage(data.error || "Failed to send invitation");
      setInviting(false);
      return;
    }

    setInviteMessage(data.warning || "Invitation sent successfully.");
    setInviteEmail("");
    setInviteName("");
    setInviteRole("learner");
    setInviting(false);

    // Refresh the user list
    fetchUsers();

    setTimeout(() => {
      setShowInvite(false);
      setInviteMessage("");
    }, 1500);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;

    setSaving(true);
    setEditMessage("");

    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: editName.trim(),
        role: editRole,
        location: editLocation.trim(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setEditMessage(data.error || "Failed to update user");
      setSaving(false);
      return;
    }

    setEditMessage("User updated.");
    setSaving(false);
    fetchUsers();
    router.refresh();

    setTimeout(() => {
      setEditUser(null);
      setEditMessage("");
    }, 1000);
  }

  async function handleDelete() {
    if (!deleteUser) return;

    setDeleting(true);

    const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete user");
    }

    setDeleting(false);
    setDeleteUser(null);
    fetchUsers();
    router.refresh();
  }

  async function runUserAction(action: string) {
    if (!editUser) return;
    setActionLoading(action);
    setActionMessage("");

    const res = await fetch("/api/admin/user-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        user_id: editUser.id,
        email: editUser.email,
      }),
    });

    const data = await res.json();
    setActionLoading("");

    if (res.ok) {
      setActionMessage(data.message || data.warning || "Done.");
      fetchUsers();
    } else {
      setActionMessage(data.error || "Action failed.");
    }
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setCsvUsers([]);
        return;
      }

      // Parse header
      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const emailIdx = header.findIndex((h) =>
        h.includes("email")
      );
      const nameIdx = header.findIndex(
        (h) => h.includes("name") || h.includes("full")
      );
      const roleIdx = header.findIndex((h) => h.includes("role"));

      if (emailIdx < 0) {
        setCsvUsers([]);
        return;
      }

      const parsed = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          email: cols[emailIdx] ?? "",
          full_name: nameIdx >= 0 ? cols[nameIdx] ?? "" : "",
          role: roleIdx >= 0 ? cols[roleIdx]?.toLowerCase() ?? "learner" : "learner",
        };
      }).filter((u) => u.email.includes("@"));

      setCsvUsers(parsed);
    };
    reader.readAsText(file);
  }

  async function handleBulkInvite() {
    if (csvUsers.length === 0) return;
    setBulkImporting(true);
    setBulkResults(null);

    const res = await fetch("/api/admin/bulk-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users: csvUsers }),
    });

    const data = await res.json();
    setBulkImporting(false);

    if (res.ok && data.summary) {
      setBulkResults(data.summary);
      fetchUsers();
    }
  }

  // Distinct locations for the filter dropdown
  const locations = Array.from(
    new Set(users.map((u) => u.location).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredUsers = users
    .filter(
      (u) =>
        (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())) &&
        (roleFilter === "all" || u.role === roleFilter) &&
        (statusFilter === "all" || u.status === statusFilter) &&
        (locationFilter === "all"
          ? true
          : locationFilter === "__none__"
            ? !u.location
            : u.location === locationFilter)
    )
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "email":
          return a.email.localeCompare(b.email) * dir;
        case "role":
          return a.role.localeCompare(b.role) * dir;
        case "location":
          return (a.location || "").localeCompare(b.location || "") * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "last_active": {
          const av = lastActiveOf(a) ? Date.parse(lastActiveOf(a)!) : 0;
          const bv = lastActiveOf(b) ? Date.parse(lastActiveOf(b)!) : 0;
          return (av - bv) * dir;
        }
        case "last_sign_in": {
          const av = a.last_sign_in_at
            ? new Date(a.last_sign_in_at).getTime()
            : 0;
          const bv = b.last_sign_in_at
            ? new Date(b.last_sign_in_at).getTime()
            : 0;
          return (av - bv) * dir;
        }
        case "created":
          return (
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()) *
            dir
          );
        case "name":
        default:
          return (a.full_name || a.email).localeCompare(
            b.full_name || b.email
          ) * dir;
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            People
          </h1>

          <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />

          <p className="mt-4 flex items-center gap-2 text-slate-500">
            Manage users and send invitations.
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {users.length} total
            </span>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowBulkImport(true);
              setCsvUsers([]);
              setBulkResults(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Upload size={18} />
            Bulk Import
          </button>

          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
          >
            <UserPlus size={18} />
            Invite user
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-pd-red"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-pd-red"
          title="Filter by role"
        >
          <option value="all">All roles</option>
          <option value="learner">Learner</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-pd-red"
          title="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-pd-red"
          title="Filter by location"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
          <option value="__none__">No location</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as typeof sortBy)
          }
          className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-pd-red"
          title="Sort by"
        >
          <option value="name">Sort: Name</option>
          <option value="email">Sort: Email</option>
          <option value="role">Sort: Role</option>
          <option value="location">Sort: Location</option>
          <option value="status">Sort: Status</option>
          <option value="last_active">Sort: Last active</option>
          <option value="last_sign_in">Sort: Last sign in</option>
          <option value="created">Sort: Date added</option>
        </select>

        <button
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
      </div>

      {/* Users table (scrolls ~10 rows) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-3.5 font-semibold text-slate-700">Name</th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">Email</th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">Role</th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">
                Location
              </th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">Status</th>
              <th className="px-6 py-3.5 font-semibold text-slate-700" title="Refreshes every 5 minutes">
                Last active
              </th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">
                Last sign in
              </th>
              <th className="px-6 py-3.5 font-semibold text-slate-700">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-10 text-center text-slate-400"
                >
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {u.full_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={u.location || ""}
                        onChange={(e) =>
                          saveLocationInline(u.id, e.target.value)
                        }
                        disabled={savingLocationId === u.id}
                        className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-pd-red disabled:opacity-50"
                        title="Set location"
                      >
                        <option value="">— None —</option>
                        {u.location && !COUNTRIES.includes(u.location) && (
                          <option value={u.location}>{u.location}</option>
                        )}
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {savingLocationId === u.id && (
                        <Loader2
                          size={14}
                          className="animate-spin text-slate-400"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-green-50 text-green-700"
                          : u.status === "archived"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          u.status === "active"
                            ? "bg-green-500"
                            : u.status === "archived"
                              ? "bg-slate-500"
                              : "bg-amber-500"
                        }`}
                      />
                      {u.status === "active"
                        ? "Active"
                        : u.status === "archived"
                          ? "Archived"
                          : "Invited"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <LastActiveCell iso={lastActiveOf(u)} status={presence[u.id]?.status} />
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditUser(u);
                          setEditName(u.full_name);
                          setEditRole(u.role);
                          setEditLocation(u.location || "");
                          setEditMessage("");
                        }}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        title="Edit user"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        onClick={() => setDeleteUser(u)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <p className="mt-3 text-right text-xs text-slate-400">
        Showing {filteredUsers.length} of {users.length} user
        {users.length !== 1 ? "s" : ""}
      </p>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Invite a user
              </h2>
              <button
                onClick={() => {
                  setShowInvite(false);
                  setInviteMessage("");
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Full name{" "}
                  <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                  placeholder="Their full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                >
                  <option value="learner">Learner</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Sets the user&apos;s access level immediately.
                </p>
              </div>

              {inviteMessage && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {inviteMessage}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowInvite(false);
                    setInviteMessage("");
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
                >
                  {inviting && <Loader2 size={16} className="animate-spin" />}
                  <Mail size={16} />
                  {inviting ? "Sending..." : "Send invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Edit user
              </h2>
              <button
                onClick={() => setEditUser(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">{editUser.email}</p>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Full name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                >
                  <option value="learner">Learner</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Location{" "}
                  <span className="text-slate-400">(country)</span>
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Australia"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

              {editMessage && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {editMessage}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>

            {/* Account actions */}
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Account Actions
              </p>

              {actionMessage && (
                <div className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {actionMessage}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => runUserAction("resend_confirmation")}
                  disabled={actionLoading !== ""}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {actionLoading === "resend_confirmation" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Mail size={16} />
                  )}
                  Resend confirmation email
                </button>

                <button
                  type="button"
                  onClick={() => runUserAction("force_reset")}
                  disabled={actionLoading !== ""}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {actionLoading === "force_reset" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <KeyRound size={16} />
                  )}
                  Force password reset (email temp password)
                </button>

                {editUser.status === "archived" ? (
                  <button
                    type="button"
                    onClick={() => runUserAction("unarchive")}
                    disabled={actionLoading !== ""}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {actionLoading === "unarchive" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArchiveRestore size={16} />
                    )}
                    Restore team member
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => runUserAction("archive")}
                    disabled={actionLoading !== ""}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    {actionLoading === "archive" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Archive size={16} />
                    )}
                    Archive team member
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Delete user?
            </h2>

            <p className="mt-3 text-sm text-slate-500">
              This will permanently remove{" "}
              <span className="font-medium text-slate-700">
                {deleteUser.full_name || deleteUser.email}
              </span>{" "}
              and all their data. This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteUser(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Bulk Import Users
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Upload a CSV file with columns: email, full_name, role
                </p>
              </div>
              <button
                onClick={() => setShowBulkImport(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* File upload */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select CSV file
                </label>

                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      const csv = "email,full_name,role\njohn@example.com,John Smith,learner\njane@example.com,Jane Doe,admin\n";
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "user_import_template.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-pd-red hover:text-pd-red-hover"
                  >
                    <Upload size={15} />
                    Download CSV template
                  </button>
                </div>

                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-pd-red/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-pd-red"
                />
                <p className="mt-2 text-xs text-slate-400">
                  CSV format: email, full_name (optional), role (optional:
                  learner/admin/super_admin). First row should be headers.
                </p>
              </div>

              {/* Preview table */}
              {csvUsers.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Preview ({csvUsers.length} users)
                  </p>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 font-medium text-slate-600">
                            Email
                          </th>
                          <th className="px-4 py-2 font-medium text-slate-600">
                            Name
                          </th>
                          <th className="px-4 py-2 font-medium text-slate-600">
                            Role
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvUsers.map((u, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-slate-900">
                              {u.email}
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {u.full_name || "—"}
                            </td>
                            <td className="px-4 py-2">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                                {u.role}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Results */}
              {bulkResults && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                  <p className="font-medium text-slate-900">Import complete</p>
                  <div className="mt-2 flex gap-4">
                    <span className="text-green-700">
                      {bulkResults.invited} invited
                    </span>
                    {bulkResults.failed > 0 && (
                      <span className="text-red-600">
                        {bulkResults.failed} failed
                      </span>
                    )}
                    {bulkResults.skipped > 0 && (
                      <span className="text-slate-500">
                        {bulkResults.skipped} skipped
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-6">
              <button
                onClick={() => setShowBulkImport(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {bulkResults ? "Done" : "Cancel"}
              </button>
              {!bulkResults && (
                <button
                  onClick={handleBulkInvite}
                  disabled={bulkImporting || csvUsers.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
                >
                  {bulkImporting && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  {bulkImporting
                    ? "Inviting..."
                    : `Invite ${csvUsers.length} users`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LastActiveCell({
  iso,
  status,
}: {
  iso: string | null;
  status?: "active" | "idle" | "offline";
}) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        Active now
      </span>
    );
  if (!iso) return <span className="text-slate-400">Never</span>;
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  const label =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins}m ago`
        : mins < 24 * 60
          ? `${Math.floor(mins / 60)}h ago`
          : new Date(iso).toLocaleDateString();
  return (
    <span
      className={status === "idle" ? "text-amber-700" : "text-slate-500"}
      title={new Date(iso).toLocaleString()}
    >
      {status === "idle" ? `Online · idle (${label})` : label}
    </span>
  );
}
