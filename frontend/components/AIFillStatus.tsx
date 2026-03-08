import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type FilledField = {
  xpath?: string;
  field_label?: string;
  value?: string;
  confidence?: number;
};

export function AIFillStatus({ fields }: { fields: FilledField[] }) {
  if (!fields.length) {
    return <p className="text-sm text-slate-500">No AI fill data available for this application.</p>;
  }

  return (
    <div className="space-y-2">
      {fields.map((field, index) => {
        const confidence = Math.round((field.confidence ?? 0) * 100);
        return (
          <div key={`${field.xpath ?? index}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium">{field.field_label ?? field.xpath ?? "Unknown field"}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{field.value ?? ""}</p>
            </div>
            <Badge variant={confidence >= 70 ? "success" : confidence >= 40 ? "warning" : "destructive"}>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {confidence}%
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
