"use client";

import { useEffect, useMemo, useState } from "react";

import { AIFillStatus, type FilledField } from "@/components/AIFillStatus";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";
import { type Application } from "@/lib/types";

const COLUMNS: Array<{ id: Application["status"]; label: string }> = [
  { id: "SAVED", label: "Saved" },
  { id: "APPLIED", label: "Applied" },
  { id: "INTERVIEW", label: "Interview" },
  { id: "OFFER", label: "Offer" },
  { id: "REJECTED", label: "Rejected" }
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function ApplicationKanban() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ applications: Application[] }>("/applications?limit=200&page=1");
      setApplications(response.data.applications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplications();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<Application["status"], Application[]>();
    COLUMNS.forEach((column) => map.set(column.id, []));

    applications.forEach((item) => {
      map.get(item.status)?.push(item);
    });

    return map;
  }, [applications]);

  const moveCard = async (applicationId: string, targetStatus: Application["status"]) => {
    const target = applications.find((item) => item.id === applicationId);
    if (!target || target.status === targetStatus) return;

    const previous = applications;
    setApplications((current) => current.map((item) => (item.id === applicationId ? { ...item, status: targetStatus } : item)));

    try {
      await apiClient.put(`/applications/${applicationId}`, { status: targetStatus });
      pushToast(`Moved to ${targetStatus}`, "success");
    } catch {
      setApplications(previous);
      pushToast("Unable to update application status", "error");
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((column) => (
          <div key={column.id} className="space-y-3">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((column) => (
          <section
            key={column.id}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggedId) {
                void moveCard(draggedId, column.id);
                setDraggedId(null);
              }
            }}
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {column.label}
            </h3>
            <div className="space-y-2">
              {(grouped.get(column.id) ?? []).map((application) => (
                <button
                  key={application.id}
                  type="button"
                  draggable
                  onDragStart={() => setDraggedId(application.id)}
                  onClick={() => setSelected(application)}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <p className="text-sm font-medium">{application.job?.title ?? "Job"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{application.job?.company ?? "Unknown company"}</p>
                  <p className="mt-1 text-xs text-slate-500">Applied: {formatDate(application.appliedAt)}</p>
                </button>
              ))}
              {(grouped.get(column.id) ?? []).length === 0 ? <p className="text-xs text-slate-500">No items</p> : null}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title={selected?.job?.title ?? "Application"}>
        {selected ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>Company:</strong> {selected.job?.company ?? "N/A"}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>Status:</strong> {selected.status}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>Applied:</strong> {formatDate(selected.appliedAt)}
            </p>

            <div>
              <h4 className="mb-2 text-sm font-semibold">AI Fill Data Used</h4>
              <AIFillStatus fields={Array.isArray(selected.aiFilledData) ? (selected.aiFilledData as FilledField[]) : []} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
