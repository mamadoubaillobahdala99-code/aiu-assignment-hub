import React from "react";
import { FileText } from "lucide-react";
import { EmptyState } from "../../components/shared";
import { TicketCard } from "./TicketCard";

// The list of a class's assignments, on the teacher's class page.
//
// This file used to hold the old "New assignment" form as well. Every
// assignment is now built with one of the structured builders or with
// the test importer — the buttons just above this list on the class
// page — so the old form, and the half-finished assignments it could
// produce, are gone. What is left is the list itself.
export function AssignmentsTab({ assignments, onOpen }) {
  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={26} />}
        title="No assignments yet"
        body="Use Import a test, or one of the Structured buttons above, to build your first one."
      />
    );
  }

  return (
    <div className="ticket-list">
      {assignments.map((a) => (
        <TicketCard
          key={a.id}
          assignment={{ ...a, dueDate: a.due_date, time_limit_minutes: a.time_limit_minutes }}
          onClick={() => onOpen(a)}
        />
      ))}
    </div>
  );
}
