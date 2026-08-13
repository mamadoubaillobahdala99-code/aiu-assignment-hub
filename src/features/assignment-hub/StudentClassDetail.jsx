import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, GraduationCap, FileText, Users } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { PageHeader, EmptyState, CenterSpinner } from "../../components/shared";
import { TicketCard } from "./TicketCard";
import { StatusBadge } from "../../components/shared";

export function StudentClassDetail({ classId, userId, setScreen }) {
  const [cls, setCls] = useState(null);
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("classes").select("name, profiles(name)").eq("id", classId).single();
    setCls(c || null);

    const { data: assignments } = await supabase.from("assignments").select("*").eq("class_id", classId);
    const { data: mySubs } = await supabase.from("submissions").select("*").eq("student_id", userId);

    const combined = (assignments || []).map((a) => {
      const mine = (mySubs || []).find((s) => s.assignment_id === a.id);
      let status = "pending";
      if (mine?.grade) status = "graded";
      else if (mine?.submitted_at) status = "submitted";
      else if (mine?.started_at) status = "in-progress";
      return { ...a, dueDate: a.due_date, status };
    });
    combined.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    setItems(combined);
  }, [classId, userId]);

  useEffect(() => { load(); }, [load]);

  if (!cls || items === null) return <CenterSpinner />;

  return (
    <div className="page">
      <button className="back-link" onClick={() => setScreen({ name: "student-classes" })}><ArrowLeft size={14} /> My Classes</button>

      <PageHeader
        eyebrow="Class"
        title={cls.name}
        action={
          <div className="class-card-teacher" style={{ marginTop: 0 }}>
            <GraduationCap size={14} /> {cls.profiles?.name || "Unknown teacher"}
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Nothing posted yet" body="Your teacher hasn't added any assignments to this class yet." />
      ) : (
        <div className="ticket-list">
          {items.map((a) => (
            <TicketCard
              key={a.id}
              assignment={a}
              onClick={() => setScreen({ name: "assignment-student", classId, assignmentId: a.id })}
              statusBadge={<StatusBadge status={a.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
