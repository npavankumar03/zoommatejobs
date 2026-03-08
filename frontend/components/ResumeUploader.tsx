"use client";

import { Download, FileText, UploadCloud } from "lucide-react";
import { type ChangeEvent, type DragEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import apiClient from "@/lib/api-client";

export type ResumeUploadResult = {
  fileName: string;
  uploadedAt: string;
  resumeTextPreview: string;
};

type ResumeUploaderProps = {
  fileName?: string | null;
  filePath?: string | null;
  onUploaded: (result: ResumeUploadResult) => void;
};

export function ResumeUploader({ fileName, filePath, onUploaded }: ResumeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasResume = Boolean(fileName && filePath);

  const dropzoneClass = useMemo(() => {
    if (isDragging) return "border-slate-900 bg-slate-100 dark:border-slate-100 dark:bg-slate-800";
    return "border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900";
  }, [isDragging]);

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are allowed.";
    if (file.size > 5 * 1024 * 1024) return "File size must be 5MB or less.";
    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post<ResumeUploadResult>("/profile/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      onUploaded(response.data);
    } catch (uploadError: unknown) {
      const detail =
        typeof uploadError === "object" &&
        uploadError !== null &&
        "response" in uploadError &&
        typeof (uploadError as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? (uploadError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Resume upload failed.";

      setError(detail ?? "Resume upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    event.target.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume Upload</CardTitle>
        <CardDescription>Upload a PDF resume. Existing file is overwritten.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-lg border p-6 text-center transition-colors ${dropzoneClass}`}
        >
          <UploadCloud className="mx-auto mb-2 h-8 w-8 text-slate-500" />
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Drag and drop your resume PDF here</p>
          <label className="inline-block">
            <input type="file" accept="application/pdf" className="hidden" onChange={handleSelect} disabled={isUploading} />
            <span className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              {isUploading ? "Uploading..." : "Choose File"}
            </span>
          </label>
        </div>

        {isUploading ? <Skeleton className="h-14 w-full" /> : null}

        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p> : null}

        {hasResume ? (
          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              {fileName}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const response = await apiClient.get<Blob>("/profile/resume/download", {
                      responseType: "blob"
                    });
                    const url = URL.createObjectURL(response.data);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = fileName || "resume.pdf";
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                  } catch {
                    setError("Failed to download resume.");
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
