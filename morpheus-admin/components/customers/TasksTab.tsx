"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { AC } from "@/lib/tokens";
import type { TaskRow } from "@/lib/tasks-store";
import { iconBtn } from "./tabStyles";

// Task rows / column header:
//   Name (+ optional description sub-line) | Type pill | Duration | actions
const TASK_COLS = "1fr 100px 90px 60px";

export function TasksTab({
  customerId,
  tasks,
  taskBusyId,
  onDeleteTask,
}: {
  customerId: string;
  tasks: TaskRow[];
  taskBusyId: string | null;
  onDeleteTask: (t: TaskRow) => void;
}) {
  const router = useRouter();
  return (
    <Card padding={0}>
      <TabHeader
        title="Tasks at this customer"
        count={tasks.length}
        action={
          tasks.length > 0 ? (
            <Link
              href={`/tasks/new?customer=${customerId}`}
              style={{ textDecoration: "none" }}
            >
              <Btn size="sm" kind="primary" icon="plus">
                Add task
              </Btn>
            </Link>
          ) : null
        }
      />
      <div>
        {tasks.length === 0 ? (
          <EmptyState
            icon="tasks"
            title="No tasks defined yet"
            hint="Tasks tell the rep what to do during a shift at this customer."
            actionLabel="Add task"
            onAction={() => router.push(`/tasks/new?customer=${customerId}`)}
          />
        ) : (
          <>
            <TableColumnHeader columns={TASK_COLS}>
              <div>Name</div>
              <div>Type</div>
              <div>Duration</div>
              <div />
            </TableColumnHeader>
            {tasks.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: TASK_COLS,
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < tasks.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                background: "#fff",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                  }}
                >
                  {t.name}
                </div>
                {t.description && (
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11.5,
                      color: AC.mute,
                      marginTop: 2,
                    }}
                  >
                    {t.description}
                  </div>
                )}
              </div>
              <div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontFamily: AC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    background: t.compulsory ? AC.dangerTint : AC.brandSoft,
                    color: t.compulsory ? AC.danger : AC.brandDeep,
                  }}
                >
                  {t.compulsory ? "Compulsory" : "Optional"}
                </span>
              </div>
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 12,
                  color: AC.ink2,
                  fontWeight: 600,
                }}
              >
                ~{t.duration_min}m
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                <Link href={`/tasks/${t.id}/edit`} title="Edit task" style={iconBtn}>
                  <AGlyph name="edit" size={14} color={AC.mute} />
                </Link>
                <button
                  type="button"
                  onClick={() => onDeleteTask(t)}
                  disabled={taskBusyId === t.id}
                  title="Delete task"
                  style={{
                    ...iconBtn,
                    cursor: taskBusyId === t.id ? "not-allowed" : "pointer",
                    opacity: taskBusyId === t.id ? 0.4 : 1,
                  }}
                >
                  <AGlyph name="trash" size={14} color={AC.mute} />
                </button>
              </div>
            </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
